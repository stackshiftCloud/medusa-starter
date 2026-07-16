import type { LoaderOptions } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { startWorkerHeartbeat } from "@stackshift-cloud/medusa-observe"
import { stackshiftObserver } from "../lib/stackshift-observer"
import { startStackShiftProviderProbes } from "../lib/stackshift-provider-probes"

export default function stackshiftObserveLoader({ container }: LoaderOptions) {
  const observer = stackshiftObserver()
  if (!observer) return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const role = process.env.MEDUSA_WORKER_MODE ?? "shared"
  void observer.recordProvider("medusa", "ok", `Medusa ${role} process started`, {
    revision: process.env.STACKSHIFT_RELEASE_REVISION,
  }).then(
    () => startStackShiftProviderProbes(observer, process.env),
  ).catch((error) => {
    const message = error instanceof Error ? error.message : "unknown error"
    logger.warn(`StackShift provider monitoring failed to start: ${message}`)
  })
  if (role === "worker") {
    startWorkerHeartbeat(observer, { revision: process.env.STACKSHIFT_RELEASE_REVISION })
    logger.info("StackShift worker heartbeat enabled")
  }
}
