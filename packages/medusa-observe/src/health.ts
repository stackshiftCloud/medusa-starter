import type { StackShiftMedusaObserver } from "./observer.js"
import type { HealthCheck } from "./types.js"

interface ResponseLike {
  status(code: number): ResponseLike
  json(value: unknown): unknown
}

export function createHealthHandler(
  observer: StackShiftMedusaObserver,
  options: {
    role?: string
    revision?: string
    checks?: Record<string, HealthCheck>
  } = {},
) {
  return async (_request: unknown, response: ResponseLike): Promise<unknown> => {
    const health = await observer.health(
      options.role ?? environment("MEDUSA_WORKER_MODE") ?? "server",
      options.revision ?? environment("STACKSHIFT_RELEASE_REVISION"),
      options.checks,
    )
    return response.status(health.status === "unhealthy" ? 503 : 200).json(health)
  }
}

export function startWorkerHeartbeat(
  observer: StackShiftMedusaObserver,
  options: { role?: string; revision?: string; interval_ms?: number } = {},
): () => void {
  const role = options.role ?? "worker"
  const revision = options.revision ?? environment("STACKSHIFT_RELEASE_REVISION")
  const interval = options.interval_ms ?? observer.options.heartbeat_interval_ms ?? 15_000
  if (interval < 1_000) throw new Error("Heartbeat interval must be at least 1000ms")
  void observer.heartbeat(role, revision)
  const timer = setInterval(() => void observer.heartbeat(role, revision), interval)
  ;(timer as unknown as { unref?: () => void }).unref?.()
  return () => clearInterval(timer)
}

function environment(name: string): string | undefined {
  const process = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> }
  }).process
  return process?.env?.[name]
}
