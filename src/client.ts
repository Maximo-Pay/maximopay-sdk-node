import { HttpClient, type MaximoPayOptions } from './http.js';
import { Charges } from './resources/charges.js';
import { Sandbox } from './resources/sandbox.js';
import { WebhookEndpoints } from './resources/webhook-endpoints.js';
import { Withdrawals } from './resources/withdrawals.js';
import { Webhooks } from './webhooks.js';

export class MaximoPay {
  readonly charges: Charges;
  readonly withdrawals: Withdrawals;
  readonly webhookEndpoints: WebhookEndpoints;
  /** Simula o adquirente; só funciona com a URL e uma chave do sandbox. */
  readonly sandbox: Sandbox;
  /** Verificação dos webhooks recebidos (não chama a API). */
  readonly webhooks = new Webhooks();

  constructor(options: MaximoPayOptions) {
    const http = new HttpClient(options);
    this.charges = new Charges(http);
    this.withdrawals = new Withdrawals(http);
    this.webhookEndpoints = new WebhookEndpoints(http);
    this.sandbox = new Sandbox(http);
  }
}
