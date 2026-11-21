import type { HttpClient, RequestOptions } from '../http.js';
import type {
  CreateWithdrawalParams,
  ListWithdrawalsParams,
  Page,
  Withdrawal,
} from '../types.js';

export class Withdrawals {
  constructor(private readonly http: HttpClient) {}

  /**
   * Pede um saque. Com "exigir 2FA nos saques" ligado (padrão) a chave de API
   * recebe 403 `TOTP_REQUIRED`.
   */
  create(
    params: CreateWithdrawalParams,
    options?: RequestOptions,
  ): Promise<Withdrawal> {
    return this.http.request({
      method: 'POST',
      path: '/withdrawals',
      body: { currencyCode: 'BRL', ...params },
      idempotent: true,
      options,
    });
  }

  retrieve(id: string): Promise<Withdrawal> {
    return this.http.request({
      method: 'GET',
      path: `/withdrawals/${encodeURIComponent(id)}`,
    });
  }

  list(params: ListWithdrawalsParams = {}): Promise<Page<Withdrawal>> {
    return this.http.request({
      method: 'GET',
      path: '/withdrawals',
      query: { ...params },
    });
  }
}
