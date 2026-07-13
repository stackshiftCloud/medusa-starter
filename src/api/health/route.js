import { createHealthHandler } from "@stackshift-cloud/medusa-observe";
import { stackshiftObserver } from "../../lib/stackshift-observer";
export async function GET(request, response) {
    const observer = stackshiftObserver();
    if (!observer) {
        return response.status(200).json({
            status: "ok",
            role: process.env.MEDUSA_WORKER_MODE ?? "shared",
            revision: process.env.STACKSHIFT_RELEASE_REVISION,
            telemetry: "disabled",
            checked_at: new Date().toISOString(),
        });
    }
    return createHealthHandler(observer, {
        role: process.env.MEDUSA_WORKER_MODE ?? "server",
        revision: process.env.STACKSHIFT_RELEASE_REVISION,
    })(request, response);
}
