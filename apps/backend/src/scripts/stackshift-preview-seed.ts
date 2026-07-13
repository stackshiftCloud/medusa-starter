import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import bootstrap from "./stackshift-bootstrap"

export default async function stackshiftPreviewSeed(args: ExecArgs) {
  const environment = process.env.STACKSHIFT_ENVIRONMENT
  if (environment !== "preview") {
    throw new Error("StackShift preview seed may run only in a preview environment")
  }
  const logger = args.container.resolve(ContainerRegistrationKeys.LOGGER)
  if (process.env.STACKSHIFT_PREVIEW_SEED_ENABLED !== "true") {
    logger.info("Preview fixtures are disabled; running safe store bootstrap only")
  }
  await bootstrap(args)
  logger.info("No customer, order, or production data was copied into this preview")
}
