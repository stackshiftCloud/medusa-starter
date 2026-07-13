import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import StackShiftNotificationProviderService from "./service.js"

export { StackShiftMailAPIError, StackShiftMailClient } from "./client.js"
export { StackShiftNotificationProvider } from "./provider.js"
export { StackShiftNotificationProviderService }
export type * from "./types.js"

export default ModuleProvider(Modules.NOTIFICATION, { services: [StackShiftNotificationProviderService] })
