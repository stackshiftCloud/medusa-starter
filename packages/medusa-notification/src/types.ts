export type FetchLike = typeof fetch

export interface LoggerLike {
  debug?(message: string): void
  info?(message: string): void
  warn?(message: string): void
  error?(message: string): void
}

export interface NotificationContent {
  subject?: string
  html?: string
  text?: string
}

export interface NotificationInput {
  id?: string
  to: string
  channel?: string
  template: string
  data?: Record<string, unknown> | null
  content?: NotificationContent | null
  from?: string | null
  idempotency_key?: string
  attachments?: Array<{
    content: string
    filename: string
    content_type?: string
    disposition?: string
    id?: string
  }> | null
  provider_data?: Record<string, unknown> | null
}

export interface TemplateMapping extends NotificationContent {
  template?: string
  version_id?: string
  from?: string
}

export interface StackShiftNotificationOptions {
  api_key: string
  from: string
  mail_url?: string
  channels?: string[]
  templates?: Record<string, TemplateMapping>
  sandbox?: boolean
  sandbox_to?: string
  fetch?: FetchLike
}

export interface MailResponse {
  id: string
  status: string
  idempotencyStatus?: string
}
