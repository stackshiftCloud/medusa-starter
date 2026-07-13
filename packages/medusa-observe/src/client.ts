import type { FetchLike, ObserveOptions, ProviderHealth, QueueMetric } from "./types.js"

export class TelemetryAPIError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = "TelemetryAPIError"
  }
}

export class StackShiftTelemetryClient {
  private readonly baseUrl: string

  constructor(private readonly options: ObserveOptions) {
    this.baseUrl = (options.telemetry_url ?? "https://api.stackshift.cloud/api/v1/medusa/telemetry")
      .replace(/\/$/, "")
  }

  heartbeat(input: { role: string; revision?: string; observed_at: string }) {
    return this.post("/heartbeats", input)
  }

  queue(metric: QueueMetric) {
    return this.post("/metrics", { type: "queue", ...metric })
  }

  provider(health: ProviderHealth) {
    return this.post("/providers", { ...health })
  }

  release(input: { revision: string; status: string; metadata?: Record<string, unknown> }) {
    return this.post("/releases", input)
  }

  private async post(path: string, value: Record<string, unknown>): Promise<void> {
    const fetcher: FetchLike = this.options.fetch ?? fetch
    let response: Response
    try {
      response = await fetcher(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.api_key}`,
          "Content-Type": "application/json",
          "X-StackShift-Environment": this.options.environment_id,
        },
        body: JSON.stringify({ environment_id: this.options.environment_id, ...value }),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown network failure"
      throw new TelemetryAPIError(`StackShift telemetry network failure: ${message}`, 0, true)
    }
    if (!response.ok) {
      throw new TelemetryAPIError(
        `StackShift telemetry failed with ${response.status}`,
        response.status,
        response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500,
      )
    }
  }
}
