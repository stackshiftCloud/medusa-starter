import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import StackShiftFileProviderService from "./service.js"

export { StackShiftFileAPIError, StackShiftFileClient } from "./client.js"
export { StackShiftFileProvider } from "./provider.js"
export { StackShiftS3Client, StackShiftS3Error } from "./s3-client.js"
export { presignRequest, sha256Hex, signRequest } from "./sigv4.js"
export { StackShiftFileProviderService }
export type * from "./types.js"

export default ModuleProvider(Modules.FILE, { services: [StackShiftFileProviderService] })
