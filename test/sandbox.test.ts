import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MaximoPay } from '../src/index.js';
import { creds, fakeFetch, json } from './helpers.js';

test('cada comando do sandbox chama a rota certa com o corpo certo', async () => {
  const f = fakeFetch((req) => json(200, { id: 'x', path: req.url.pathname }));
  const mp = new MaximoPay({ ...creds, fetch: f.fetchImpl });
  await mp.sandbox.charges.pay('ch 1');
  await mp.sandbox.charges.dispute('ch_1', { type: 'REFUND_REQUEST', amount: 500 });
  await mp.sandbox.charges.dispute('ch_1');
  await mp.sandbox.disputes.close('d_1', { result: 'WON' });
  await mp.sandbox.withdrawals.complete('w_1');
  await mp.sandbox.withdrawals.fail('w_1', { reason: 'conta encerrada' });
  await mp.sandbox.withdrawals.return('w_1');
  await mp.sandbox.refunds.complete('r_1');
  await mp.sandbox.refunds.fail('r_1');
  assert.deepEqual(
    f.calls.map((c) => [c.method, c.url.pathname, c.body]),
    [
      ['POST', '/v1/sandbox/charges/ch%201/pay', undefined],
      ['POST', '/v1/sandbox/charges/ch_1/dispute', { type: 'REFUND_REQUEST', amount: '500' }],
      ['POST', '/v1/sandbox/charges/ch_1/dispute', {}],
      ['POST', '/v1/sandbox/disputes/d_1/close', { result: 'WON' }],
      ['POST', '/v1/sandbox/withdrawals/w_1/complete', undefined],
      ['POST', '/v1/sandbox/withdrawals/w_1/fail', { reason: 'conta encerrada' }],
      ['POST', '/v1/sandbox/withdrawals/w_1/return', undefined],
      ['POST', '/v1/sandbox/refunds/r_1/complete', undefined],
      ['POST', '/v1/sandbox/refunds/r_1/fail', undefined],
    ],
  );
  assert.ok(f.calls.every((c) => c.headers['idempotency-key'] === undefined));
});

test('responde o objeto atualizado, com livemode', async () => {
  const f = fakeFetch(() => json(200, { id: 'ch_1', status: 'PAID', livemode: false }));
  const mp = new MaximoPay({ ...creds, fetch: f.fetchImpl });
  const charge = await mp.sandbox.charges.pay('ch_1');
  assert.equal(charge.status, 'PAID');
  assert.equal(charge.livemode, false);
});

test('um comando do sandbox nunca é repetido (não tem chave de idempotência)', async () => {
  const f = fakeFetch(() => json(503, { errorCode: 'SERVICE_UNAVAILABLE' }));
  const mp = new MaximoPay({ ...creds, fetch: f.fetchImpl, maxRetries: 2 });
  await assert.rejects(mp.sandbox.charges.pay('ch_1'), { statusCode: 503 });
  assert.equal(f.calls.length, 1);
});

test('estado inválido vira MaximoPayError com details.status', async () => {
  const f = fakeFetch(() =>
    json(409, {
      statusCode: 409,
      errorCode: 'SANDBOX_INVALID_STATE',
      message: 'A cobrança não está PENDING',
      details: { status: 'PAID' },
    }),
  );
  const mp = new MaximoPay({ ...creds, fetch: f.fetchImpl });
  await assert.rejects(mp.sandbox.charges.pay('ch_1'), {
    name: 'MaximoPayError',
    errorCode: 'SANDBOX_INVALID_STATE',
    details: { status: 'PAID' },
  });
});

test('chave de teste na API real: TEST_KEY_ON_LIVE traz a URL do sandbox', async () => {
  const fetchImpl = (async () =>
    json(401, {
      statusCode: 401,
      errorCode: 'TEST_KEY_ON_LIVE',
      message: 'Chave de teste na API real',
      details: { sandboxUrl: 'https://sandbox-api.test/v1' },
    })) as typeof fetch;
  const mp = new MaximoPay({ ...creds, appId: 'pk_test_1', fetch: fetchImpl });
  await assert.rejects(mp.charges.retrieve('ch_1'), {
    errorCode: 'TEST_KEY_ON_LIVE',
    details: { sandboxUrl: 'https://sandbox-api.test/v1' },
  });
});
