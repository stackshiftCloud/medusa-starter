import { StackShiftS3Client } from "@stackshift-cloud/medusa-file";
import { StackShiftMailClient } from "@stackshift-cloud/medusa-notification";
import { FlutterwaveClient } from "@stackshift-cloud/medusa-payment-flutterwave";
import { PaystackClient } from "@stackshift-cloud/medusa-payment-paystack";
export async function startStackShiftProviderProbes(observer, environment, intervalMs = 30000) {
    const probes = stackshiftProviderProbes(environment);
    const revision = environment.STACKSHIFT_RELEASE_REVISION;
    let running = false;
    const run = async () => {
        if (running)
            return;
        running = true;
        try {
            await Promise.all(probes.map(async (probe) => {
                try {
                    await probe.check();
                    await observer.recordProvider(probe.name, "ok", `${probe.name} probe succeeded`, {
                        probe: "non_mutating", revision,
                    });
                }
                catch (error) {
                    await observer.recordProvider(probe.name, "unhealthy", `${probe.name} probe failed`, {
                        error_class: error instanceof Error ? error.name : "unknown_error",
                        probe: "non_mutating", revision,
                    });
                }
            }));
        }
        finally {
            running = false;
        }
    };
    await run();
    const timer = setInterval(() => void run(), intervalMs);
    timer.unref?.();
    return () => clearInterval(timer);
}
export function stackshiftProviderProbes(environment) {
    const probes = [];
    if (all(environment, "S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY")) {
        const client = new StackShiftS3Client({ endpoint: environment.S3_ENDPOINT, region: environment.S3_REGION,
            bucket: environment.S3_BUCKET, accessKeyId: environment.S3_ACCESS_KEY_ID,
            secretAccessKey: environment.S3_SECRET_ACCESS_KEY });
        probes.push({ name: "storage", check: () => client.health() });
    }
    if (all(environment, "STACKSHIFT_MAIL_API_KEY", "STACKSHIFT_MAIL_FROM")) {
        const client = new StackShiftMailClient(environment.STACKSHIFT_MAIL_API_KEY, fetch, environment.STACKSHIFT_MAIL_URL);
        probes.push({ name: "mail", check: () => client.health() });
    }
    if (all(environment, "PAYSTACK_SECRET_KEY")) {
        const client = new PaystackClient(environment.PAYSTACK_SECRET_KEY);
        probes.push({ name: "paystack", check: () => client.health() });
    }
    if (all(environment, "FLUTTERWAVE_SECRET_KEY")) {
        const client = new FlutterwaveClient(environment.FLUTTERWAVE_SECRET_KEY);
        probes.push({ name: "flutterwave", check: () => client.health() });
    }
    return probes;
}
function all(environment, ...keys) {
    return keys.every((key) => Boolean(environment[key]));
}
