import { AbstractPaymentProvider } from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import { FlutterwavePaymentProvider } from "./provider.js"
import type {
  FlutterwaveOptions,
  LoggerLike,
} from "./types.js"

interface Dependencies {
  logger?: LoggerLike
}

export class FlutterwavePaymentProviderService extends AbstractPaymentProvider<FlutterwaveOptions> {
  static readonly identifier = FlutterwavePaymentProvider.identifier
  private readonly delegate: FlutterwavePaymentProvider

  static validateOptions(options: FlutterwaveOptions): void {
    FlutterwavePaymentProvider.validateOptions(options)
  }

  constructor(container: Dependencies, options: FlutterwaveOptions) {
    super(container as Record<string, unknown>, options)
    this.delegate = new FlutterwavePaymentProvider(
      { ...options, fetch: options.fetch ?? globalThis.fetch },
      { logger: container.logger },
    )
  }

  getIdentifier() { return this.delegate.getIdentifier() }
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    return this.delegate.initiatePayment(input)
  }
  updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return this.delegate.updatePayment(input)
  }
  deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return this.delegate.deletePayment(input)
  }
  authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    return this.delegate.authorizePayment(input)
  }
  capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return this.delegate.capturePayment(input)
  }
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    return this.delegate.refundPayment(input)
  }
  retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return this.delegate.retrievePayment(input)
  }
  cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return this.delegate.cancelPayment(input)
  }
  getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    return this.delegate.getPaymentStatus(input)
  }
  getWebhookActionAndData(input: ProviderWebhookPayload["payload"]): Promise<WebhookActionResult> {
    return this.delegate.getWebhookActionAndData(input)
  }
}

export default FlutterwavePaymentProviderService
