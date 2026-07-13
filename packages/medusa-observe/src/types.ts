export type FetchLike = typeof fetch
export type HealthStatus = "ok" | "degraded" | "unhealthy"

export interface LoggerLike {
  debug?(message: string): void
  info?(message: string): void
  warn?(message: string): void
  error?(message: string): void
}

export interface ObserveOptions {
  api_key: string
  environment_id: string
  telemetry_url?: string
  heartbeat_interval_ms?: number
  fetch?: FetchLike
}

export interface QueueMetric {
  queue: string
  depth: number
  oldest_job_age_ms: number
  processing_latency_ms: number
  observed_at?: string
}

export interface ProviderHealth {
  provider: string
  status: HealthStatus
  message?: string
  observed_at: string
  details?: Record<string, unknown>
}

export interface HealthResult {
  status: HealthStatus
  environment_id: string
  role: string
  revision?: string
  checked_at: string
  telemetry: HealthStatus
  queue?: QueueMetric
  providers: ProviderHealth[]
  checks: Record<string, { status: HealthStatus; message?: string }>
}

export type HealthCheck = () => Promise<boolean | { status: HealthStatus; message?: string }>
