import type { HttpClient } from '../http.js';
import type {
  CreateWebhookEndpointParams,
  Page,
  UpdateWebhookEndpointParams,
  WebhookEndpoint,
} from '../types.js';

/** Cadastro dos endereços que recebem webhooks (`/merchants/webhooks`). */
export class WebhookEndpoints {
  constructor(private readonly http: HttpClient) {}

  create(params: CreateWebhookEndpointParams): Promise<WebhookEndpoint> {
    if (!params.events || params.events.length === 0) {
      // A API aceita sem eventos, mas uma config assim não recebe nada.
      throw new TypeError("MaximoPay: informe events (ou ['*'] para todos)");
    }
    return this.http.request({
      method: 'POST',
      path: '/merchants/webhooks',
      body: params,
    });
  }

  list(
    params: { page?: number; limit?: number } = {},
  ): Promise<Page<WebhookEndpoint>> {
    return this.http.request({
      method: 'GET',
      path: '/merchants/webhooks',
      query: { ...params },
    });
  }

  retrieve(id: string): Promise<WebhookEndpoint> {
    return this.http.request({
      method: 'GET',
      path: `/merchants/webhooks/${encodeURIComponent(id)}`,
    });
  }

  /** `{ isActive: true }` reativa um endereço pausado por falhas seguidas. */
  update(
    id: string,
    params: UpdateWebhookEndpointParams,
  ): Promise<WebhookEndpoint> {
    return this.http.request({
      method: 'PUT',
      path: `/merchants/webhooks/${encodeURIComponent(id)}`,
      body: params,
    });
  }

  delete(id: string): Promise<unknown> {
    return this.http.request({
      method: 'DELETE',
      path: `/merchants/webhooks/${encodeURIComponent(id)}`,
    });
  }

  /** Histórico de entregas do lojista. */
  deliveries(): Promise<unknown> {
    return this.http.request({
      method: 'GET',
      path: '/merchants/webhooks/history',
    });
  }

  delivery(id: string): Promise<unknown> {
    return this.http.request({
      method: 'GET',
      path: `/merchants/webhooks/delivery/${encodeURIComponent(id)}`,
    });
  }
}
