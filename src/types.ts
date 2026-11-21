/** Valores de dinheiro chegam como string de centavos (`"1500"` = R$ 15,00). */
export type MinorUnits = string;

export type ChargeStatus =
  | 'PENDING'
  | 'AUTHORIZED'
  | 'PAID'
  | 'FAILED'
  | 'DENIED'
  | 'CANCELED'
  | 'EXPIRED'
  | 'REFUND_PENDING'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | (string & {});

export type PaymentMethod =
  'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'CRYPTO';

export interface Customer {
  name: string;
  /** CPF ou CNPJ, só dígitos. */
  document: string;
  email: string;
  phone?: string;
}

export interface ChargeSplit {
  merchantId: string;
  /** Parte do líquido em pontos-base (1–10000). Use `bps` ou `amount`. */
  bps?: number;
  /** Valor fixo em centavos. */
  amount?: number;
}

export interface CreateChargeParams {
  /** Valor em centavos, inteiro (1500 = R$ 15,00). */
  amount: number;
  paymentMethod: PaymentMethod;
  customer: Customer;
  /** Padrão `BRL`. */
  currencyCode?: string;
  /** Seu id do pedido; volta em `charge.referenceId` e nos webhooks. */
  referenceId?: string;
  /** Pix: `{ expirationMinutes }`. Boleto/cartão/cripto: ver /api/docs. */
  paymentDetails?: Record<string, unknown>;
  splits?: ChargeSplit[];
}

export interface Charge {
  id: string;
  status: ChargeStatus;
  amount: MinorUnits | number;
  feeAmount?: MinorUnits;
  netAmount?: MinorUnits;
  currencyCode: string;
  paymentMethod: PaymentMethod;
  referenceId: string | null;
  expirationDate?: string | null;
  paidAt?: string | null;
  createdAt: string;
  /** Página pronta de pagamento Pix. */
  checkoutUrl?: string;
  /** `false` no sandbox, `true` na API real. */
  livemode?: boolean;
  metadata?: {
    /** Código Pix copia e cola (para o QR). */
    pixCopiaECola?: string;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

export interface ListChargesParams {
  status?: ChargeStatus;
  page?: number;
  limit?: number;
}

export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RefundChargeParams {
  /** Centavos; sem ele devolve o restante. */
  amount?: number;
  reason?: string;
}

export type WithdrawalMethod = 'PIX' | 'BANK_TRANSFER' | 'CRYPTO';

export interface CreateWithdrawalParams {
  /** Valor bruto em centavos. */
  amount: number;
  withdrawalMethod: WithdrawalMethod;
  /** Pix por chave: `{ pixKeyType, pixKey, document?, name? }`; por QR: `{ qrCode }`. */
  withdrawalDetails?: Record<string, unknown>;
  currencyCode?: string;
  referenceId?: string;
  /** Saques pedem 2FA por padrão; para sacar com chave de API desligue a opção no painel. */
  totpCode?: string;
}

export interface Withdrawal {
  id: string;
  status: string;
  amount: MinorUnits | number;
  referenceId?: string | null;
  createdAt: string;
  /** `false` no sandbox, `true` na API real. */
  livemode?: boolean;
  [key: string]: unknown;
}

export interface ListWithdrawalsParams {
  page?: number;
  limit?: number;
}

export type WebhookEventType =
  | 'charge.created'
  | 'charge.paid'
  | 'charge.refunded'
  | 'charge.expired'
  | 'charge.failed'
  | 'charge.cancelled'
  | 'withdrawal.requested'
  | 'withdrawal.completed'
  | 'withdrawal.failed'
  | 'withdrawal.returned'
  | 'dispute.opened'
  | 'dispute.updated'
  | 'dispute.won'
  | 'dispute.lost'
  | 'dispute.cancelled';

export interface CreateWebhookEndpointParams {
  /** https e público. */
  url: string;
  /** 32–256 caracteres; assina cada entrega (`X-Signature`). Nunca é devolvido. */
  secret: string;
  /** Eventos a receber, ou `['*']` para todos. */
  events: (WebhookEventType | '*')[];
  /** Filtra pelo `status` do corpo (ex. `PAID`); vazio = todos. */
  statuses?: string[];
  isActive?: boolean;
  maxRetries?: number;
  retryIntervalSeconds?: number;
  timeoutSeconds?: number;
  pauseAfterFailures?: boolean;
  failuresBeforePause?: number;
}

export type UpdateWebhookEndpointParams = Partial<CreateWebhookEndpointParams>;

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  [key: string]: unknown;
}

/** Corpo de um evento `charge.*` (contrato `ChargeEventV2`). */
export interface ChargeEventData {
  schemaVersion?: number;
  id: string;
  merchantId: string;
  amount: MinorUnits;
  feeAmount: MinorUnits;
  currency: string;
  paymentMethod: string;
  status: ChargeStatus;
  referenceId?: string | null;
  refundAmount?: MinorUnits;
  occurredAt: string;
  /** `false` quando o webhook veio do sandbox. */
  livemode?: boolean;
  [key: string]: unknown;
}

export interface WebhookEvent<T = Record<string, unknown>> {
  /** `X-Delivery-Id`: o mesmo em cada nova tentativa; use para ignorar repetidas. */
  id: string;
  /** `X-Event`, ex. `charge.paid`. */
  type: WebhookEventType | (string & {});
  data: T;
}

/** MED (disputa) como a API responde; ver /api/docs para os demais campos. */
export interface Dispute {
  id: string;
  status?: string;
  resolution?: string;
  [key: string]: unknown;
}

export interface SandboxDisputeParams {
  /** Padrão `FRAUD`. */
  type?: 'FRAUD' | 'REFUND_REQUEST';
  /** Centavos contestados; sem ele, o valor total da cobrança. */
  amount?: number | string;
}

export interface CloseSandboxDisputeParams {
  result: 'LOST' | 'WON';
}

export interface FailSandboxWithdrawalParams {
  reason?: string;
}
