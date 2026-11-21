import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';

// Roda o exemplo do README (dist já construído pelo `npm test`) contra uma API
// falsa e manda a ele um webhook assinado de verdade.
const examplePath = join(
  __dirname,
  '..',
  '..',
  'examples',
  'charge-and-webhook.mjs',
);

test('o exemplo tem menos de 20 linhas', () => {
  const lines = readFileSync(examplePath, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '' && !l.trim().startsWith('//'));
  assert.ok(lines.length < 20, `${lines.length} linhas`);
});

function listen(server: Server): Promise<number> {
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve((server.address() as AddressInfo).port),
    ),
  );
}

test('o exemplo cria a cobrança e aceita só o webhook assinado', async (t) => {
  const seen: string[] = [];
  const api = createServer((req, res) => {
    seen.push(
      `${req.method} ${req.url} ${req.headers['idempotency-key'] ? 'key' : ''}`.trim(),
    );
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/auth/token')
      return res
        .writeHead(201)
        .end(JSON.stringify({ accessToken: 't', expiresIn: 3600 }));
    res
      .writeHead(201)
      .end(
        JSON.stringify({
          id: 'ch_1',
          status: 'PENDING',
          metadata: { pixCopiaECola: '000201PIX' },
        }),
      );
  });
  const apiPort = await listen(api);
  t.after(() => api.close());

  const probe = createServer();
  const port = await listen(probe);
  await new Promise((r) => probe.close(r));

  const secret = 'whsec_' + 'a'.repeat(40);
  const child = spawn(process.execPath, [examplePath], {
    env: {
      ...process.env,
      MP_APP_ID: 'app',
      MP_APP_SECRET: 'sec',
      MP_BASE_URL: `http://127.0.0.1:${apiPort}/v1`,
      MP_WEBHOOK_SECRET: secret,
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());
  let out = '';
  child.stdout.on('data', (d: Buffer) => (out += d.toString()));
  child.stderr.on('data', (d: Buffer) => (out += d.toString()));

  const waitFor = async (text: string) => {
    for (let i = 0; i < 100 && !out.includes(text); i++)
      await new Promise((r) => setTimeout(r, 50));
    assert.ok(out.includes(text), `esperava "${text}" em: ${out}`);
  };
  await waitFor('Pix copia e cola: 000201PIX');
  assert.deepEqual(seen, ['POST /v1/auth/token', 'POST /v1/charges key']);

  const body = JSON.stringify({
    id: 'ch_1',
    status: 'PAID',
    referenceId: 'pedido-123',
  });
  const send = async (signature: string) => {
    for (let i = 0; i < 40; i++) {
      try {
        return await fetch(`http://127.0.0.1:${port}/`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-event': 'charge.paid',
            'x-delivery-id': 'd1',
            'x-signature': signature,
          },
          body,
        });
      } catch {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    throw new Error('servidor do exemplo não subiu');
  };
  const forged = await send(
    `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`,
  );
  assert.equal(forged.status, 400);

  const ts = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  const signed = await send(`t=${ts},v1=${v1}`);
  assert.equal(signed.status, 200);
  await waitFor('Pedido pago: pedido-123');
});
