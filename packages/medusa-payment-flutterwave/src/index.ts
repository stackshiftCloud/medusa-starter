import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import FlutterwavePaymentProviderService from "./service.js"

export { FlutterwaveAPIError, FlutterwaveClient } from "./client.js"
export { FlutterwavePaymentProvider } from "./provider.js"
export { FlutterwavePaymentProviderService }
export type * from "./types.js"

export default ModuleProvider(Modules.PAYMENT, { services: [FlutterwavePaymentProviderService] })
