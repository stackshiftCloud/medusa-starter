import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { startWorkerHeartbeat } from "@stackshift-cloud/medusa-observe";
import { stackshiftObserver } from "../lib/stackshift-observer";
import { startStackShiftProviderProbes } from "../lib/stackshift-provider-probes";
export default async function stackshiftObserveLoader({ container }) {
    const observer = stackshiftObserver();
    if (!observer)
        return;
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
    const role = process.env.MEDUSA_WORKER_MODE ?? "shared";
    await observer.recordProvider("medusa", "ok", `Medusa ${role} process started`, {
        revision: process.env.STACKSHIFT_RELEASE_REVISION,
    });
    await startStackShiftProviderProbes(observer, process.env);
    if (role === "worker") {
        startWorkerHeartbeat(observer, { revision: process.env.STACKSHIFT_RELEASE_REVISION });
        logger.info("StackShift worker heartbeat enabled");
    }
}
