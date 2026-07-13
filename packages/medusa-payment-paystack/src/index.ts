import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import PaystackPaymentProviderService from "./service.js"

export { PaystackAPIError, PaystackClient } from "./client.js"
export { PaystackPaymentProvider } from "./provider.js"
export { PaystackPaymentProviderService }
export type * from "./types.js"

export default ModuleProvider(Modules.PAYMENT, { services: [PaystackPaymentProviderService] })
