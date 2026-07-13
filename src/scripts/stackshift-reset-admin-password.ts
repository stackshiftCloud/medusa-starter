import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

export default async function stackshiftResetAdminPassword({ container }: ExecArgs) {
  const email = process.env.MEDUSA_ADMIN_EMAIL
  const password = process.env.MEDUSA_ADMIN_PASSWORD
  if (!email || !password) throw new Error("Admin reset credentials are required")

  const authModule = container.resolve(Modules.AUTH)
  const result = await authModule.updateProvider("emailpass", {
    entity_id: email,
    password,
  })
  if (!result.success) throw new Error("Admin password reset failed")

  container.resolve(ContainerRegistrationKeys.LOGGER)
    .info("StackShift admin password reset completed")
}
