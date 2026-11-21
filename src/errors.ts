/** Erro devolvido pela API (`{ statusCode, errorCode, message, details }`). */
export class MaximoPayError extends Error {
  readonly statusCode: number;
  /** Código estável para tratar no seu código, ex. `KYC_LIMIT_EXCEEDED`. */
  readonly errorCode: string;
  readonly details?: Record<string, unknown>;
  /** `x-correlation-id` da resposta: informe ao suporte. */
  readonly correlationId?: string;

  constructor(args: {
    statusCode: number;
    errorCode: string;
    message: string;
    details?: Record<string, unknown>;
    correlationId?: string;
  }) {
    super(args.message);
    this.name = 'MaximoPayError';
    this.statusCode = args.statusCode;
    this.errorCode = args.errorCode;
    this.details = args.details;
    this.correlationId = args.correlationId;
  }
}

/** A requisição não chegou a ter resposta (rede, DNS, tempo esgotado). */
export class MaximoPayConnectionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MaximoPayConnectionError';
  }
}

/** O webhook não veio do Máximo Pay, foi alterado ou é antigo demais. */
export class SignatureVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignatureVerificationError';
  }
}
