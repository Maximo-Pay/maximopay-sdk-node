import type { HttpClient, RequestOptions } from '../http.js';
import type {
  Charge,
  CreateChargeParams,
  ListChargesParams,
  Page,
  RefundChargeParams,
} from '../types.js';

export class Charges {
  constructor(private readonly http: HttpClient) {}

  /** Cria uma cobrança. Pix: a resposta traz `metadata.pixCopiaECola` e `checkoutUrl`. */
  create(
    params: CreateChargeParams,
    options?: RequestOptions,
  ): Promise<Charge> {
    return this.http.request({
      method: 'POST',
      path: '/charges',
      body: { currencyCode: 'BRL', ...params },
      idempotent: true,
      options,
    });
  }

  retrieve(id: string): Promise<Charge> {
    return this.http.request({
      method: 'GET',
      path: `/charges/${encodeURIComponent(id)}`,
    });
  }

  list(params: ListChargesParams = {}): Promise<Page<Charge>> {
    return this.http.request({
      method: 'GET',
      path: '/charges',
      query: { ...params },
    });
  }

  /** Cancela uma cobrança ainda não paga. */
  cancel(id: string, options?: RequestOptions): Promise<Charge> {
    return this.http.request({
      method: 'POST',
      path: `/charges/${encodeURIComponent(id)}/cancel`,
      idempotent: true,
      options,
    });
  }

  /** Devolve tudo (sem `amount`) ou parte; várias parciais até o valor pago. */
  refund(
    id: string,
    params: RefundChargeParams = {},
    options?: RequestOptions,
  ): Promise<Charge> {
    return this.http.request({
      method: 'POST',
      path: `/charges/${encodeURIComponent(id)}/refund`,
      body: params,
      idempotent: true,
      options,
    });
  }
}
