import { StackShiftTelemetryClient } from "./client.js"
import type {
  HealthCheck,
  HealthResult,
  HealthStatus,
  LoggerLike,
  ObserveOptions,
  ProviderHealth,
  QueueMetric,
} from "./types.js"

export class StackShiftMedusaObserver {
  readonly client: StackShiftTelemetryClient
  private readonly providers = new Map<string, ProviderHealth>()
  private queueMetric?: QueueMetric
  private telemetryStatus: HealthStatus = "ok"

  constructor(
    readonly options: ObserveOptions,
    private readonly logger?: LoggerLike,
  ) {
    if (!options?.api_key) throw new Error("Observe option `api_key` is required")
    if (!options.environment_id) throw new Error("Observe option `environment_id` is required")
    this.client = new StackShiftTelemetryClient(options)
  }

  async heartbeat(role: string, revision?: string): Promise<boolean> {
    return this.deliver(
      () => this.client.heartbeat({ role, revision, observed_at: new Date().toISOString() }),
      "worker heartbeat",
    )
  }

  async recordQueue(metric: QueueMetric): Promise<boolean> {
    validateMetric(metric)
    this.queueMetric = { ...metric, observed_at: metric.observed_at ?? new Date().toISOString() }
    return this.deliver(() => this.client.queue(this.queueMetric!), `queue ${metric.queue}`)
  }

  async recordProvider(
    provider: string,
    status: HealthStatus,
    message?: string,
    details?: Record<string, unknown>,
  ): Promise<boolean> {
    const health: ProviderHealth = {
      provider,
      status,
      message,
      observed_at: new Date().toISOString(),
      details: details ? redact(details) : undefined,
    }
    this.providers.set(provider, health)
    return this.deliver(() => this.client.provider(health), `provider ${provider}`)
  }

  recordRelease(
    revision: string,
    status: string,
    metadata?: Record<string, unknown>,
  ): Promise<boolean> {
    if (!revision) throw new Error("Release revision is required")
    return this.deliver(
      () => this.client.release({ revision, status, metadata: metadata ? redact(metadata) : undefined }),
      `release ${revision}`,
    )
  }

  async health(
    role: string,
    revision?: string,
    checks: Record<string, HealthCheck> = {},
  ): Promise<HealthResult> {
    const resolved: HealthResult["checks"] = {}
    for (const [name, check] of Object.entries(checks)) {
      try {
        const result = await check()
        resolved[name] = typeof result === "boolean"
          ? { status: result ? "ok" : "unhealthy" }
          : result
      } catch (error) {
        resolved[name] = { status: "unhealthy", message: safeMessage(error) }
      }
    }
    const statuses = [
      this.telemetryStatus,
      ...Array.from(this.providers.values(), (provider) => provider.status),
      ...Object.values(resolved).map((check) => check.status),
    ]
    return {
      status: aggregate(statuses),
      environment_id: this.options.environment_id,
      role,
      revision,
      checked_at: new Date().toISOString(),
      telemetry: this.telemetryStatus,
      queue: this.queueMetric,
      providers: Array.from(this.providers.values()),
      checks: resolved,
    }
  }

  private async deliver(send: () => Promise<void>, operation: string): Promise<boolean> {
    try {
      await send()
      this.telemetryStatus = "ok"
      return true
    } catch (error) {
      this.telemetryStatus = "degraded"
      this.logger?.warn?.(`StackShift ${operation} telemetry unavailable: ${safeMessage(error)}`)
      return false
    }
  }
}

function validateMetric(metric: QueueMetric): void {
  for (const [name, value] of Object.entries({
    depth: metric.depth,
    oldest_job_age_ms: metric.oldest_job_age_ms,
    processing_latency_ms: metric.processing_latency_ms,
  })) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Queue metric ${name} must be non-negative`)
  }
}

function aggregate(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes("unhealthy")) return "unhealthy"
  return statuses.includes("degraded") ? "degraded" : "ok"
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error"
}

function redact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (/secret|password|token|api.?key|authorization|cookie/i.test(key)) return [key, "[REDACTED]"]
    if (Array.isArray(item)) return [key, item.map((entry) => isRecord(entry) ? redact(entry) : entry)]
    return [key, isRecord(item) ? redact(item) : item]
  }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
