import { StackShiftMailClient } from "./client.js"
import type {
  LoggerLike,
  NotificationInput,
  StackShiftNotificationOptions,
  TemplateMapping,
} from "./types.js"

export class StackShiftNotificationProvider {
  static readonly identifier = "stackshift-mail"
  readonly client: StackShiftMailClient
  private readonly options: StackShiftNotificationOptions
  private readonly logger?: LoggerLike

  constructor(options: StackShiftNotificationOptions, dependencies: { logger?: LoggerLike } = {}) {
    StackShiftNotificationProvider.validateOptions(options)
    this.options = options
    this.logger = dependencies.logger
    this.client = new StackShiftMailClient(options.api_key, options.fetch ?? fetch, options.mail_url)
  }

  static validateOptions(options: StackShiftNotificationOptions): void {
    if (!options?.api_key) throw new Error("StackShift Notification option `api_key` is required")
    if (!options.from) throw new Error("StackShift Notification option `from` is required")
    if (options.sandbox && !options.sandbox_to) {
      throw new Error("StackShift Notification option `sandbox_to` is required in sandbox mode")
    }
  }

  async send(notification: NotificationInput): Promise<{ id: string }> {
    if (!notification?.to) throw new Error("Notification recipient is required")
    if (!notification.template) throw new Error("Notification template is required")
    const channel = notification.channel ?? "email"
    if (!(this.options.channels ?? ["email"]).includes(channel)) {
      throw new Error(`StackShift Notification does not handle channel ${channel}`)
    }
    const mapping = this.options.templates?.[notification.template]
    const data = notification.data ?? {}
    const providerData = asRecord(notification.provider_data) ?? {}
    const extras = mailExtras(notification, providerData, Boolean(this.options.sandbox))
    const to = this.options.sandbox ? this.options.sandbox_to! : notification.to
    const from = notification.from ?? mapping?.from ?? this.options.from
    const idempotencyKey = await notificationKey(notification, to)
    try {
      const response = mapping?.template || (!mapping && !notification.content)
        ? await this.client.sendTemplate({
            template: mapping?.template ?? notification.template,
            versionId: mapping?.version_id,
            to,
            from,
            data,
            idempotencyKey,
            ...extras,
          })
        : await this.client.send({
            to,
            from,
            subject: render(requiredContent("subject", notification, mapping), data, false),
            html: render(optionalContent("html", notification, mapping), data, true),
            text: render(optionalContent("text", notification, mapping), data, false),
            idempotencyKey,
            ...extras,
          })
      this.logger?.debug?.(`Queued StackShift notification ${response.id}`)
      return { id: response.id }
    } catch (error) {
      this.logger?.error?.(`StackShift notification ${notification.template} failed`)
      throw error
    }
  }
}

function requiredContent(
  key: keyof TemplateMapping,
  notification: NotificationInput,
  mapping?: TemplateMapping,
): string {
  const value = optionalContent(key, notification, mapping)
  if (!value) throw new Error(`Notification template ${notification.template} has no ${key}`)
  return value
}

function optionalContent(
  key: keyof TemplateMapping,
  notification: NotificationInput,
  mapping?: TemplateMapping,
): string | undefined {
  const content = notification.content?.[key as keyof NonNullable<NotificationInput["content"]>]
  const value = content ?? mapping?.[key]
  return typeof value === "string" ? value : undefined
}

function render(
  template: string | undefined,
  data: Record<string, unknown>,
  html: boolean,
): string | undefined {
  return template?.replace(/{{\s*([\w.-]+)\s*}}/g, (_match, path: string) => {
    const value = path.split(".").reduce<unknown>((current, part) => {
      return current && typeof current === "object"
        ? (current as Record<string, unknown>)[part]
        : undefined
    }, data)
    const text = value === undefined || value === null ? "" : String(value)
    return html ? escapeHtml(text) : text
  })
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!)
}

async function notificationKey(notification: NotificationInput, recipient: string): Promise<string> {
  if (notification.idempotency_key) return notification.idempotency_key
  const providerKey = asRecord(notification.provider_data)?.idempotency_key
  if (typeof providerKey === "string" && providerKey) return providerKey
  const fromData = notification.data?.idempotency_key
  if (typeof fromData === "string" && fromData) return fromData
  if (notification.id) return notification.id
  const stable = JSON.stringify([notification.template, recipient, sortRecord(notification.data ?? {})])
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable)))
  return `medusa-${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`
}

function mailExtras(
  notification: NotificationInput,
  providerData: Record<string, unknown>,
  sandbox: boolean,
): Record<string, unknown> {
  const attachments = providerData.attachments
  if (notification.attachments?.length && !Array.isArray(attachments)) {
    throw new Error(
      "StackShift Mail requires uploaded attachment IDs in provider_data.attachments; inline attachments are unsupported",
    )
  }
  return clean({
    attachments: Array.isArray(attachments) ? attachments : undefined,
    cc: sandbox ? undefined : providerData.cc,
    bcc: sandbox ? undefined : providerData.bcc,
    replyTo: providerData.reply_to ?? providerData.replyTo,
  })
}

function clean(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function sortRecord(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortRecord)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortRecord(item)]),
  )
}
