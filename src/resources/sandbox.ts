import type { HttpClient } from '../http.js';
import type {
  Charge,
  CloseSandboxDisputeParams,
  Dispute,
  FailSandboxWithdrawalParams,
  SandboxDisputeParams,
  Withdrawal,
} from '../types.js';

/**
 * Comandos que simulam o adquirente. Existem só no sandbox (na API real dão
 * 404) e respondem o objeto já atualizado. Não levam `Idempotency-Key`, então
 * o SDK nunca os repete: numa falha de rede, consulte o objeto antes de mandar
 * de novo (um segundo comando dá 409 `SANDBOX_INVALID_STATE`).
 */
export class Sandbox {
  readonly charges: SandboxCharges;
  readonly disputes: SandboxDisputes;
  readonly withdrawals: SandboxWithdrawals;
  readonly refunds: SandboxRefunds;

  constructor(http: HttpClient) {
    const post = <T>(path: string, body?: Record<string, unknown>) =>
      http.request<T>({ method: 'POST', path: `/sandbox${path}`, body });
    this.charges = new SandboxCharges(post);
    this.disputes = new SandboxDisputes(post);
    this.withdrawals = new SandboxWithdrawals(post);
    this.refunds = new SandboxRefunds(post);
  }
}

type Post = <T>(path: string, body?: Record<string, unknown>) => Promise<T>;
const seg = encodeURIComponent;

export class SandboxCharges {
  constructor(private readonly post: Post) {}

  /** Paga uma cobrança `PENDING` (dispara `charge.paid`). */
  pay(id: string): Promise<Charge> {
    return this.post(`/charges/${seg(id)}/pay`);
  }

  /** Abre uma MED na cobrança paga; sem `amount`, no valor total. */
  dispute(id: string, params: SandboxDisputeParams = {}): Promise<Charge> {
    const { amount, ...rest } = params;
    return this.post(`/charges/${seg(id)}/dispute`, {
      ...rest,
      ...(amount === undefined ? {} : { amount: String(amount) }),
    });
  }
}

export class SandboxDisputes {
  constructor(private readonly post: Post) {}

  /** Encerra a MED como `LOST` ou `WON`. */
  close(id: string, params: CloseSandboxDisputeParams): Promise<Dispute> {
    return this.post(`/disputes/${seg(id)}/close`, { ...params });
  }
}

export class SandboxWithdrawals {
  constructor(private readonly post: Post) {}

  /** Conclui o saque (sozinho ele conclui em ~5 s). */
  complete(id: string): Promise<Withdrawal> {
    return this.post(`/withdrawals/${seg(id)}/complete`);
  }

  /** Falha o saque; o valor volta para a carteira. */
  fail(id: string, params: FailSandboxWithdrawalParams = {}): Promise<Withdrawal> {
    return this.post(`/withdrawals/${seg(id)}/fail`, { ...params });
  }

  /** Devolve um saque já concluído. */
  return(id: string): Promise<Withdrawal> {
    return this.post(`/withdrawals/${seg(id)}/return`);
  }
}

export class SandboxRefunds {
  constructor(private readonly post: Post) {}

  /** Conclui a devolução (sozinha ela conclui em ~5 s); responde a cobrança. */
  complete(refundId: string): Promise<Charge> {
    return this.post(`/refunds/${seg(refundId)}/complete`);
  }

  /** Recusa a devolução; responde a cobrança. */
  fail(refundId: string): Promise<Charge> {
    return this.post(`/refunds/${seg(refundId)}/fail`);
  }
}
