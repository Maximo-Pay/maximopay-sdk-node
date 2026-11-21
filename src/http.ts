import { randomUUID } from 'node:crypto';
import { MaximoPayConnectionError, MaximoPayError } from './errors.js';

export interface MaximoPayOptions {
  /** `appId` da chave de API (painel › Chaves de API). */
  appId: string;
  /** `appSecret` da chave de API. Nunca exponha no navegador. */
  appSecret: string;
  /** URL da API com a versão, ex. `https://api.seudominio.com.br/v1`. */
  baseUrl: string;
  /** Repetições automáticas em falha de rede, 5xx, 429 e 409 em andamento. Padrão 2. */
  maxRetries?: number;
  /** Tempo máximo de cada tentativa. Padrão 30 s. */
  timeoutMs?: number;
  /** `fetch` alternativo (testes, proxy). Padrão o global. */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  /**
   * Chave de idempotência. Nas rotas que exigem, o SDK gera uma (UUID) se
   * você não passar; passe a sua (ex. o id do pedido) para que um novo envio
   * do mesmo pedido nunca crie uma segunda cobrança.
   */
  idempotencyKey?: string;
}

interface Call {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** A rota exige `Idempotency-Key`. */
  idempotent?: boolean;
  options?: RequestOptions;
}

interface TokenState {
  accessToken: string;
  expiresAt: number;
}

const TOKEN_REFRESH_MARGIN_MS = 60_000;
const MAX_BACKOFF_MS = 8_000;

export class HttpClient {
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private token: TokenState | null = null;
  private pendingToken: Promise<TokenState> | null = null;

  constructor(private readonly options: MaximoPayOptions) {
    if (!options.appId || !options.appSecret) {
      throw new TypeError('MaximoPay: appId e appSecret são obrigatórios');
    }
    if (!options.baseUrl) {
      throw new TypeError(
        'MaximoPay: baseUrl é obrigatório (ex. https://api.seudominio.com.br/v1)',
      );
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.timeoutMs = options.timeoutMs ?? 30_000;
    const f = options.fetch ?? globalThis.fetch;
    if (typeof f !== 'function') {
      throw new TypeError(
        'MaximoPay: fetch não disponível; use Node 18+ ou passe options.fetch',
      );
    }
    this.fetchImpl = f;
  }

  async request<T>(call: Call): Promise<T> {
    // A mesma chave em todas as tentativas: repetir com outra poderia criar
    // duas cobranças.
    const idempotencyKey = call.idempotent
      ? (call.options?.idempotencyKey ?? randomUUID())
      : undefined;
    // Sem chave, só repete o que não cria nada.
    const retryable = call.method !== 'POST' || idempotencyKey !== undefined;
    let refreshedAfter401 = false;

    for (let attempt = 0; ; attempt++) {
      let token: TokenState;
      let response: Response;
      try {
        token = await this.getToken();
      } catch (error) {
        if (
          error instanceof MaximoPayConnectionError &&
          attempt < this.maxRetries
        ) {
          await sleep(backoff(attempt));
          continue;
        }
        throw error;
      }
      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: `Bearer ${token.accessToken}`,
      };
      if (call.body !== undefined) headers['Content-Type'] = 'application/json';
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

      try {
        response = await this.send(this.url(call.path, call.query), {
          method: call.method,
          headers,
          body: call.body === undefined ? undefined : JSON.stringify(call.body),
        });
      } catch (error) {
        if (retryable && attempt < this.maxRetries) {
          await sleep(backoff(attempt));
          continue;
        }
        throw error;
      }

      if (response.status === 401 && !refreshedAfter401) {
        // Token revogado ou expirado antes da hora: um novo, uma vez.
        refreshedAfter401 = true;
        this.token = null;
        attempt--;
        continue;
      }
      if (response.ok) return (await readBody(response)) as T;

      const error = await toError(response);
      if (retryable && attempt < this.maxRetries && shouldRetry(error)) {
        await sleep(retryAfterMs(response) ?? backoff(attempt));
        continue;
      }
      throw error;
    }
  }

  private async getToken(): Promise<TokenState> {
    if (
      this.token &&
      Date.now() < this.token.expiresAt - TOKEN_REFRESH_MARGIN_MS
    ) {
      return this.token;
    }
    // Requisições simultâneas esperam a mesma troca de token.
    this.pendingToken ??= this.fetchToken().finally(() => {
      this.pendingToken = null;
    });
    return this.pendingToken;
  }

  private async fetchToken(): Promise<TokenState> {
    const response = await this.send(this.url('/auth/token'), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        appId: this.options.appId,
        appSecret: this.options.appSecret,
      }),
    });
    if (!response.ok) throw await toError(response);
    const body = (await readBody(response)) as {
      accessToken?: string;
      expiresIn?: number;
    };
    if (
      typeof body?.accessToken !== 'string' ||
      typeof body.expiresIn !== 'number'
    ) {
      throw new MaximoPayError({
        statusCode: response.status,
        errorCode: 'INVALID_TOKEN_RESPONSE',
        message: 'Resposta inesperada de POST /auth/token',
      });
    }
    this.token = {
      accessToken: body.accessToken,
      expiresAt: Date.now() + body.expiresIn * 1000,
    };
    return this.token;
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      throw new MaximoPayConnectionError(
        `Falha ao chamar ${init.method} ${url}: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
  }

  private url(path: string, query?: Call['query']): string {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }
}

function shouldRetry(error: MaximoPayError): boolean {
  return (
    error.statusCode >= 500 ||
    error.statusCode === 429 ||
    (error.statusCode === 409 && error.errorCode === 'IDEMPOTENCY_IN_PROGRESS')
  );
}

function backoff(attempt: number): number {
  const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt);
  return base / 2 + Math.random() * (base / 2);
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds))
    return Math.min(MAX_BACKOFF_MS, Math.max(0, seconds * 1000));
  const date = Date.parse(value);
  return Number.isNaN(date)
    ? undefined
    : Math.min(MAX_BACKOFF_MS, Math.max(0, date - Date.now()));
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function toError(response: Response): Promise<MaximoPayError> {
  const body = await readBody(response);
  const envelope = (body && typeof body === 'object' ? body : {}) as {
    errorCode?: unknown;
    message?: unknown;
    details?: unknown;
  };
  return new MaximoPayError({
    statusCode: response.status,
    errorCode:
      typeof envelope.errorCode === 'string'
        ? envelope.errorCode
        : `HTTP_${response.status}`,
    message:
      typeof envelope.message === 'string'
        ? envelope.message
        : typeof body === 'string' && body
          ? body
          : `HTTP ${response.status}`,
    details:
      envelope.details && typeof envelope.details === 'object'
        ? (envelope.details as Record<string, unknown>)
        : undefined,
    correlationId: response.headers.get('x-correlation-id') ?? undefined,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
