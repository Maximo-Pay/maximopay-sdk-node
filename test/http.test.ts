import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MaximoPay,
  MaximoPayConnectionError,
  MaximoPayError,
} from '../src/index.js';
import { creds, fakeFetch, json } from './helpers.js';

const customer = {
  name: 'João Silva',
  document: '12345678909',
  email: 'joao@email.com',
};
const pix = { amount: 1500, paymentMethod: 'PIX' as const, customer };

test('troca a chave por token uma vez e reaproveita, inclusive em chamadas simultâneas', async () => {
  const f = fakeFetch(() => json(200, { id: 'ch_1' }));
  const mp = new MaximoPay({ ...creds, fetch: f.fetchImpl });
  await Promise.all([
    mp.charges.retrieve('a'),
    mp.charges.retrieve('b'),
    mp.charges.retrieve('c'),
  ]);
  await mp.charges.retrieve('d');
  assert.equal(f.tokenCount(), 1);
  assert.equal(f.calls[0]?.headers.authorization, 'Bearer tok-1');
  assert.equal(f.calls[0]?.url.href, 'https://api.test/v1/charges/a');
});

test('pede outro token quando faltam menos de 60 s para expirar', async () => {
  const f = fakeFetch(() => json(200, {}), 30);
  const mp = new MaximoPay({ ...creds, fetch: f.fetchImpl });
  await mp.charges.retrieve('a');
  await mp.charges.retrieve('b');
  assert.equal(f.tokenCount(), 2);
});

test('um 401 renova o token e repete uma vez', async () => {
  const f = fakeFetch((_req, n) =>
    n === 1
      ? json(401, { errorCode: 'TOKEN_REVOKED' })
      : json(200, { id: 'x' }),
  );
  const mp = new MaximoPay({ ...creds, fetch: f.fetchImpl, maxRetries: 0 });
  assert.deepEqual(await mp.charges.retrieve('x'), { id: 'x' });
  assert.equal(f.tokenCount(), 2);
  assert.equal(f.calls[1]?.headers.authorization, 'Bearer tok-2');
});

test('dois 401 seguidos viram erro', async () => {
  const f = fakeFetch(() =>
    json(401, {
      errorCode: 'TOKEN_REVOKED',
      message: 'revoked',
      statusCode: 401,
    }),
  );
  const mp = new MaximoPay({ ...creds, fetch: f.fetchImpl });
  await assert.rejects(mp.charges.retrieve('x'), {
    name: 'MaximoPayError',
    errorCode: 'TOKEN_REVOKED',
  });
  assert.equal(f.calls.length, 2);
});

test('cria cobrança com BRL por padrão e gera Idempotency-Key', async () => {
  const f = fakeFetch(() => json(201, { id: 'ch_1', status: 'PENDING' }));
  const mp = new MaximoPay({ ...creds, fetch: f.fetchImpl });
  await mp.charges.create(pix);
  const call = f.calls[0]!;
  assert.equal(call.method, 'POST');
  assert.deepEqual(call.body, { currencyCode: 'BRL', ...pix });
  assert.match(call.headers['idempotency-key'] ?? '', /^[0-9a-f-]{36}$/);
});

test('usa a chave de idempotência informada', async () => {
  const f = fakeFetch(() => json(201, {}));
  const mp = new MaximoPay({ ...creds, fetch: f.fetchImpl });
  await mp.charges.create(pix, { idempotencyKey: 'pedido-123' });
  await mp.charges.refund('ch_1', { amount: 500 }, { idempotencyKey: 'dev-1' });
  await mp.charges.cancel('ch_2');
  assert.equal(f.calls[0]?.headers['idempotency-key'], 'pedido-123');
  assert.equal(f.calls[1]?.headers['idempotency-key'], 'dev-1');
  assert.ok(f.calls[2]?.headers['idempotency-key']);
});

test('repete 5xx, 429 e 409 em andamento sempre com a mesma chave', async () => {
  const answers = [
    json(503, { errorCode: 'PSP_UNAVAILABLE' }, { 'retry-after': '0' }),
    json(409, { errorCode: 'IDEMPOTENCY_IN_PROGRESS' }, { 'retry-after': '0' }),
    json(201, { id: 'ch_1' }),
  ];
  const f = fakeFetch((_req, n) => answers[n - 1]!);
  const mp = new MaximoPay({ ...creds, fetch: f.fetchImpl });
  assert.deepEqual(await mp.charges.create(pix), { id: 'ch_1' });
  assert.equal(f.calls.length, 3);
  const keys = new Set(f.calls.map((c) => c.headers['idempotency-key']));
  assert.equal(keys.size, 1);
});

test('repete falha de rede com a mesma chave e desiste depois de maxRetries', async () => {
  const f = fakeFetch(() => 'network-error');
  const mp = new MaximoPay({ ...creds, fetch: f.fetchImpl, maxRetries: 1 });
  await assert.rejects(
    mp.charges.create(pix, { idempotencyKey: 'k1' }),
    MaximoPayConnectionError,
  );
  assert.equal(f.calls.length, 2);
  assert.deepEqual(
    f.calls.map((c) => c.headers['idempotency-key']),
    ['k1', 'k1'],
  );
});

test('não repete erro de negócio e expõe errorCode, details e correlationId', async () => {
  const f = fakeFetch(() =>
    json(
      422,
      {
        statusCode: 422,
        errorCode: 'KYC_LIMIT_EXCEEDED',
        message: 'limite',
        details: { available: '100' },
      },
      { 'x-correlation-id': 'corr-1' },
    ),
  );
  const mp = new MaximoPay({ ...creds, fetch: f.fetchImpl });
  const error = await mp.charges.create(pix).catch((e: unknown) => e);
  assert.ok(error instanceof MaximoPayError);
  assert.equal(error.statusCode, 422);
  assert.equal(error.errorCode, 'KYC_LIMIT_EXCEEDED');
  assert.deepEqual(error.details, { available: '100' });
  assert.equal(error.correlationId, 'corr-1');
  assert.equal(f.calls.length, 1);
});

test('POST sem idempotência (cadastro de webhook) não é repetido', async () => {
  const f = fakeFetch(() =>
    json(503, { errorCode: 'SERVICE_UNAVAILABLE' }, { 'retry-after': '0' }),
  );
  const mp = new MaximoPay({ ...creds, fetch: f.fetchImpl });
  await assert.rejects(
    mp.webhookEndpoints.create({
      url: 'https://loja.com/wh',
      secret: 'x'.repeat(32),
      events: ['charge.paid'],
    }),
    { errorCode: 'SERVICE_UNAVAILABLE' },
  );
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0]?.headers['idempotency-key'], undefined);
});

test('webhook sem events é recusado antes de chamar a API', async () => {
  const f = fakeFetch(() => json(201, {}));
  const mp = new MaximoPay({ ...creds, fetch: f.fetchImpl });
  assert.throws(
    () =>
      mp.webhookEndpoints.create({
        url: 'https://loja.com/wh',
        secret: 'x'.repeat(32),
        events: [],
      }),
    TypeError,
  );
  assert.equal(f.calls.length, 0);
});

test('lista com filtros na query e omite os vazios', async () => {
  const f = fakeFetch(() =>
    json(200, { data: [], total: 0, page: 2, limit: 10, totalPages: 0 }),
  );
  const mp = new MaximoPay({ ...creds, fetch: f.fetchImpl });
  await mp.charges.list({ status: 'PAID', page: 2, limit: 10 });
  await mp.withdrawals.list();
  assert.equal(f.calls[0]?.url.search, '?status=PAID&page=2&limit=10');
  assert.equal(f.calls[1]?.url.search, '');
});

test('credenciais e baseUrl obrigatórios', () => {
  assert.throws(
    () => new MaximoPay({ appId: '', appSecret: 'x', baseUrl: 'https://a/v1' }),
    TypeError,
  );
  assert.throws(
    () => new MaximoPay({ appId: 'a', appSecret: 'x', baseUrl: '' }),
    TypeError,
  );
});

test('credencial errada não é repetida', async () => {
  let tokenCalls = 0;
  const fetchImpl = (async () => {
    tokenCalls++;
    return json(401, { errorCode: 'INVALID_CREDENTIALS', message: 'bad' });
  }) as typeof fetch;
  const mp = new MaximoPay({ ...creds, fetch: fetchImpl });
  await assert.rejects(mp.charges.retrieve('x'), {
    errorCode: 'INVALID_CREDENTIALS',
  });
  assert.equal(tokenCalls, 1);
});
