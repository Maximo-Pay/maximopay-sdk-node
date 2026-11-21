import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  constructWebhookEvent,
  DEFAULT_TOLERANCE_SECONDS,
  SignatureVerificationError,
  verifyWebhookSignature,
} from '../src/index.js';

interface Vector {
  name: string;
  header: string;
  body: string;
  now: number;
  expected: boolean;
}
// Cópia dos vetores que o webhook-service testa (fintech-baas-api, sdks/contract).
const file = JSON.parse(
  readFileSync(
    join(
      __dirname,
      '..',
      '..',
      'contract',
      'webhook-signature-vectors.json',
    ),
    'utf8',
  ),
) as {
  secret: string;
  toleranceSeconds: number;
  sign: { timestamp: number; body: string; header: string };
  vectors: Vector[];
};

test('tolerância igual à do servidor', () => {
  assert.equal(DEFAULT_TOLERANCE_SECONDS, file.toleranceSeconds);
});

for (const v of file.vectors) {
  test(`vetor: ${v.name}`, () => {
    assert.equal(
      verifyWebhookSignature(v.body, v.header, file.secret, { now: v.now }),
      v.expected,
    );
    assert.equal(
      verifyWebhookSignature(Buffer.from(v.body), v.header, file.secret, {
        now: v.now,
      }),
      v.expected,
    );
  });
}

const { body, header, timestamp } = file.sign;

test('constructEvent devolve id, tipo e corpo, com cabeçalhos em qualquer caixa', () => {
  const event = constructWebhookEvent(
    Buffer.from(body),
    {
      'X-Signature': header,
      'x-event': 'charge.paid',
      'X-DELIVERY-ID': ['d1'],
    },
    file.secret,
    { now: timestamp },
  );
  assert.equal(event.id, 'd1');
  assert.equal(event.type, 'charge.paid');
  assert.deepEqual(event.data, JSON.parse(body));
});

test('constructEvent aceita Headers do fetch', () => {
  const headers = new Headers({
    'x-signature': header,
    'x-event': 'charge.paid',
    'x-delivery-id': 'd2',
  });
  assert.equal(
    constructWebhookEvent(body, headers, file.secret, { now: timestamp }).id,
    'd2',
  );
});

test('constructEvent recusa assinatura errada ou ausente', () => {
  assert.throws(
    () =>
      constructWebhookEvent(
        body + ' ',
        { 'x-signature': header },
        file.secret,
        { now: timestamp },
      ),
    SignatureVerificationError,
  );
  assert.throws(
    () => constructWebhookEvent(body, {}, file.secret, { now: timestamp }),
    SignatureVerificationError,
  );
  assert.throws(
    () =>
      constructWebhookEvent(body, { 'x-signature': header }, '', {
        now: timestamp,
      }),
    SignatureVerificationError,
  );
});

test('corpo já convertido em objeto é um erro de uso claro', () => {
  assert.throws(
    () =>
      constructWebhookEvent(
        JSON.parse(body) as never,
        { 'x-signature': header },
        file.secret,
      ),
    /corpo cru/,
  );
});
