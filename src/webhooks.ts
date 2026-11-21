import { createHmac, timingSafeEqual } from 'node:crypto';
import { SignatureVerificationError } from './errors.js';
import type { WebhookEvent } from './types.js';

/** Idade máxima de uma entrega aceita (a mesma do servidor). */
export const DEFAULT_TOLERANCE_SECONDS = 300;

export type RawBody = string | Uint8Array;
export type IncomingHeaders =
  Headers | Record<string, string | string[] | undefined>;

export interface VerifyOptions {
  toleranceSeconds?: number;
  /** Agora em segundos unix (testes). */
  now?: number;
}

function bodyToString(rawBody: RawBody): string {
  if (typeof rawBody === 'string') return rawBody;
  if (rawBody instanceof Uint8Array)
    return Buffer.from(rawBody).toString('utf8');
  throw new TypeError(
    'MaximoPay: passe o corpo cru (string ou Buffer), antes do JSON.parse — ex. express.raw({ type: "application/json" })',
  );
}

/**
 * Confere `X-Signature: t=<unix s>,v1=<hex HMAC-SHA256(segredo, "<t>.<corpo cru>")>`.
 * Aceita se algum `v1` bater (troca de segredo) e `t` estiver dentro da tolerância.
 */
export function verifyWebhookSignature(
  rawBody: RawBody,
  signatureHeader: string | null | undefined,
  secret: string,
  options: VerifyOptions = {},
): boolean {
  if (!signatureHeader || !secret) return false;
  const body = bodyToString(rawBody);
  let timestamp: string | undefined;
  const candidates: string[] = [];
  for (const part of signatureHeader.split(',')) {
    const at = part.indexOf('=');
    if (at <= 0) continue;
    const key = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (key === 't' && timestamp === undefined) timestamp = value;
    else if (key === 'v1') candidates.push(value);
  }
  const t = Number(timestamp);
  if (!timestamp || !Number.isInteger(t)) return false;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (
    Math.abs(now - t) > (options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS)
  )
    return false;
  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest();
  return candidates.some((hex) => {
    const given = Buffer.from(hex, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

function header(headers: IncomingHeaders, name: string): string | undefined {
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined;
  }
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(
    headers as Record<string, string | string[] | undefined>,
  )) {
    if (key.toLowerCase() === wanted)
      return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

/**
 * Verifica a assinatura e devolve o evento. Lança `SignatureVerificationError`
 * quando a entrega não deve ser processada (responda 400).
 */
export function constructWebhookEvent<T = Record<string, unknown>>(
  rawBody: RawBody,
  headers: IncomingHeaders,
  secret: string,
  options: VerifyOptions = {},
): WebhookEvent<T> {
  const body = bodyToString(rawBody);
  if (
    !verifyWebhookSignature(
      body,
      header(headers, 'x-signature'),
      secret,
      options,
    )
  ) {
    throw new SignatureVerificationError(
      'Assinatura X-Signature inválida ou expirada',
    );
  }
  let data: T;
  try {
    data = JSON.parse(body) as T;
  } catch {
    throw new SignatureVerificationError('Corpo do webhook não é JSON');
  }
  return {
    id: header(headers, 'x-delivery-id') ?? '',
    type: header(headers, 'x-event') ?? '',
    data,
  };
}

export class Webhooks {
  verifySignature(
    rawBody: RawBody,
    signatureHeader: string | null | undefined,
    secret: string,
    options?: VerifyOptions,
  ): boolean {
    return verifyWebhookSignature(rawBody, signatureHeader, secret, options);
  }

  constructEvent<T = Record<string, unknown>>(
    rawBody: RawBody,
    headers: IncomingHeaders,
    secret: string,
    options?: VerifyOptions,
  ): WebhookEvent<T> {
    return constructWebhookEvent<T>(rawBody, headers, secret, options);
  }
}
