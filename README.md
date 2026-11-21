# @maximopay/node

SDK do Máximo Pay para Node.js 18+, sem dependências. Cobre o que uma chave de API faz: cobranças, saques e o cadastro de webhooks, além da verificação da assinatura dos webhooks recebidos.

> Ainda não publicado no npm. Para usar agora: `npm run build` nesta pasta e `npm install /caminho/para/maximopay-sdk-node` no seu projeto.

## Uso

```js
import { MaximoPay } from '@maximopay/node';

const mp = new MaximoPay({
  appId: process.env.MP_APP_ID,
  appSecret: process.env.MP_APP_SECRET,
  baseUrl: 'https://api.seudominio.com.br/v1', // a URL do sandbox para testar
});

const charge = await mp.charges.create(
  {
    amount: 1500, // centavos
    paymentMethod: 'PIX',
    referenceId: 'pedido-123',
    customer: { name: 'João Silva', document: '12345678909', email: 'joao@email.com' },
  },
  { idempotencyKey: 'pedido-123' }, // opcional; sem ele o SDK gera um
);
charge.metadata.pixCopiaECola; // código do QR
charge.checkoutUrl; // página pronta de pagamento
```

Exemplo completo de cobrança + webhook, 18 linhas: [`examples/charge-and-webhook.mjs`](examples/charge-and-webhook.mjs).

### O que o SDK faz por você

- **Token:** troca `appId`/`appSecret` em `POST /auth/token`, guarda o token em memória, renova 60 s antes de expirar e uma vez depois de um 401.
- **Idempotência:** cobrança (criar, cancelar, devolver) e saque sempre levam `Idempotency-Key`. Ao repetir, o SDK usa **a mesma chave**, então uma cobrança nunca é criada duas vezes.
- **Repetição:** até `maxRetries` (padrão 2) em falha de rede, 5xx, 429 e 409 `IDEMPOTENCY_IN_PROGRESS`, com espera crescente e respeitando `Retry-After`. POST sem chave de idempotência (cadastro de webhook) nunca é repetido.
- **Erros:** a API responde `MaximoPayError` com `statusCode`, `errorCode` (use este no seu código), `message`, `details` e `correlationId` (para o suporte). Sem resposta, `MaximoPayConnectionError`.

### Recursos

| | |
|---|---|
| `mp.charges` | `create`, `retrieve`, `list({ status, page, limit })`, `cancel`, `refund(id, { amount?, reason? })` |
| `mp.withdrawals` | `create`, `retrieve`, `list({ page, limit })` |
| `mp.webhookEndpoints` | `create({ url, secret, events })`, `list`, `retrieve`, `update` (`{ isActive: true }` reativa), `delete`, `deliveries`, `delivery(id)` |
| `mp.webhooks` | `constructEvent(rawBody, headers, secret)`, `verifySignature(rawBody, header, secret)` |

Saques com chave de API só passam com "exigir 2FA nos saques" desligado no painel; ligado (padrão), a API responde 403 `TOTP_REQUIRED`.

## Webhooks

```js
// Express: o corpo precisa chegar cru, antes do JSON.parse.
app.post('/webhooks/maximopay', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    event = mp.webhooks.constructEvent(req.body, req.headers, process.env.MP_WEBHOOK_SECRET);
  } catch {
    return res.sendStatus(400); // não veio do Máximo Pay, foi alterado ou tem mais de 5 min
  }
  if (event.type === 'charge.paid') marcarComoPago(event.data.referenceId);
  res.sendStatus(200);
});
```

`event.id` é o `X-Delivery-Id`, o mesmo em cada nova tentativa: use para ignorar entregas repetidas. Para verificar sem instanciar o cliente: `import { constructWebhookEvent, verifyWebhookSignature } from '@maximopay/node'`.

## Desenvolvimento

```bash
npm install
npm test        # build, testes unitários, vetores de assinatura (contract/) e o exemplo rodando de ponta a ponta
npm run typecheck
```

Os vetores em `contract/webhook-signature-vectors.json` são cópia do arquivo que o webhook-service testa (`sdks/contract` no fintech-baas-api). Se a assinatura mudar na API, atualize a cópia aqui.
