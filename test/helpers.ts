export interface Recorded {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: unknown;
}

type Handler = (
  req: Recorded,
  n: number,
) => Response | Promise<Response> | 'network-error';

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** fetch falso: responde POST /auth/token sozinho e grava as demais chamadas. */
export function fakeFetch(handler: Handler, tokenTtlSeconds = 3600) {
  const calls: Recorded[] = [];
  let tokens = 0;
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    const body =
      typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    if (url.pathname.endsWith('/auth/token')) {
      tokens++;
      return json(201, {
        accessToken: `tok-${tokens}`,
        expiresIn: tokenTtlSeconds,
      });
    }
    const req = { method: init?.method ?? 'GET', url, headers, body };
    calls.push(req);
    const res = await handler(req, calls.length);
    if (res === 'network-error') throw new TypeError('fetch failed');
    return res;
  }) as typeof fetch;
  return { fetchImpl, calls, tokenCount: () => tokens };
}

export const creds = {
  appId: 'app_1',
  appSecret: 'secret_1',
  baseUrl: 'https://api.test/v1/',
};
