declare module "@medusajs/framework/types" {
  export type BigNumberInput = unknown
  export type PaymentSessionStatus =
    | "authorized"
    | "captured"
    | "canceled"
    | "error"
    | "pending"
    | "pending_authorization"
    | "requires_more"

  export interface PaymentProviderContext {
    customer?: {
      id: string
      email: string
      first_name?: string | null
      last_name?: string | null
      phone?: string | null
    }
    idempotency_key?: string
  }

  export interface PaymentProviderInput {
    data?: Record<string, unknown>
    context?: PaymentProviderContext
  }

  export interface InitiatePaymentInput extends PaymentProviderInput {
    amount: BigNumberInput
    currency_code: string
  }
  export interface UpdatePaymentInput extends InitiatePaymentInput {}
  export interface RefundPaymentInput extends PaymentProviderInput { amount: BigNumberInput }
  export interface AuthorizePaymentInput extends PaymentProviderInput {}
  export interface CapturePaymentInput extends PaymentProviderInput {}
  export interface CancelPaymentInput extends PaymentProviderInput {}
  export interface DeletePaymentInput extends PaymentProviderInput {}
  export interface RetrievePaymentInput extends PaymentProviderInput {}
  export interface GetPaymentStatusInput extends PaymentProviderInput {}

  export interface PaymentProviderOutput { data?: Record<string, unknown> }
  export interface InitiatePaymentOutput extends PaymentProviderOutput {
    id: string
    status?: PaymentSessionStatus
  }
  export interface AuthorizePaymentOutput extends PaymentProviderOutput { status: PaymentSessionStatus }
  export interface UpdatePaymentOutput extends PaymentProviderOutput { status?: PaymentSessionStatus }
  export interface GetPaymentStatusOutput extends PaymentProviderOutput { status: PaymentSessionStatus }
  export interface CapturePaymentOutput extends PaymentProviderOutput {}
  export interface CancelPaymentOutput extends PaymentProviderOutput {}
  export interface DeletePaymentOutput extends PaymentProviderOutput {}
  export interface RefundPaymentOutput extends PaymentProviderOutput {}
  export interface RetrievePaymentOutput extends PaymentProviderOutput {}

  export interface ProviderWebhookPayload {
    provider: string
    payload: {
      data: Record<string, unknown>
      rawData: string | Uint8Array
      headers: Record<string, unknown>
    }
  }
  export interface WebhookActionResult {
    action: "authorized" | "captured" | "failed" | "pending" | "requires_more" |
      "canceled" | "not_supported" | "pending_authorization"
    data?: { session_id: string; amount: number | string | object }
  }

  export interface ProviderSendNotificationDTO {
    to: string
    from?: string | null
    attachments?: Array<{
      content: string
      filename: string
      content_type?: string
      disposition?: string
      id?: string
    }> | null
    channel: string
    template: string
    data?: Record<string, unknown> | null
    provider_data?: Record<string, unknown> | null
    content?: { subject?: string; text?: string; html?: string } | null
  }
  export interface ProviderSendNotificationResultsDTO { id?: string }

  export interface ProviderUploadFileDTO {
    filename: string
    mimeType: string
    content: string
    access?: "public" | "private"
  }
  export interface ProviderUploadStreamDTO {
    filename: string
    mimeType: string
    access?: "public" | "private"
  }
  export interface ProviderGetPresignedUploadUrlDTO {
    filename: string
    mimeType?: string
    access?: "public" | "private"
    expiresIn?: number
  }
  export interface ProviderGetFileDTO { fileKey: string; [key: string]: unknown }
  export interface ProviderDeleteFileDTO { fileKey: string; [key: string]: unknown }
  export interface ProviderFileResultDTO { url: string; key: string }
}

declare module "@medusajs/framework/utils" {
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

  export abstract class AbstractPaymentProvider<T = Record<string, unknown>> {
    protected constructor(container: Record<string, unknown>, config?: T)
    abstract initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput>
    abstract updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput>
    abstract deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput>
    abstract authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput>
    abstract capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput>
    abstract refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput>
    abstract retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput>
    abstract cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput>
    abstract getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput>
    abstract getWebhookActionAndData(
      input: ProviderWebhookPayload["payload"],
    ): Promise<WebhookActionResult>
  }

  export abstract class AbstractFileProviderService {}

  export abstract class AbstractNotificationProviderService {}

  export const Modules: {
    FILE: string
    NOTIFICATION: string
    PAYMENT: string
  }

  export function ModuleProvider(
    module: string,
    definition: { services: Array<new (...args: any[]) => unknown> },
  ): unknown
}
