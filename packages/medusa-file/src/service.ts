import { AbstractFileProviderService } from "@medusajs/framework/utils"
import type {
  ProviderDeleteFileDTO,
  ProviderFileResultDTO,
  ProviderGetFileDTO,
  ProviderGetPresignedUploadUrlDTO,
  ProviderUploadFileDTO,
  ProviderUploadStreamDTO,
} from "@medusajs/framework/types"
import { StackShiftFileProvider } from "./provider.js"
import type {
  FileKeyInput,
  LoggerLike,
  PresignedUploadInput,
  StackShiftFileOptions,
  UploadFileInput,
} from "./types.js"

interface Dependencies {
  logger?: LoggerLike
  fetch?: typeof fetch
}

export class StackShiftFileProviderService extends AbstractFileProviderService {
  static readonly identifier = StackShiftFileProvider.identifier
  private readonly delegate: StackShiftFileProvider

  static validateOptions(options: StackShiftFileOptions): void {
    StackShiftFileProvider.validateOptions(options)
  }

  constructor(container: Dependencies, options: StackShiftFileOptions) {
    super()
    this.delegate = new StackShiftFileProvider(
      { ...options, fetch: options.fetch ?? container.fetch },
      { logger: container.logger },
    )
  }

  upload(input: ProviderUploadFileDTO): Promise<ProviderFileResultDTO> {
    return this.delegate.upload(input)
  }
  delete(input: ProviderDeleteFileDTO | ProviderDeleteFileDTO[]): Promise<void> {
    return this.delegate.delete(input)
  }
  getPresignedDownloadUrl(input: ProviderGetFileDTO): Promise<string> {
    return this.delegate.getPresignedDownloadUrl(input)
  }
  getPresignedUploadUrl(input: ProviderGetPresignedUploadUrlDTO): Promise<ProviderFileResultDTO> {
    return this.delegate.getPresignedUploadUrl(input)
  }
  getUploadStream(input: ProviderUploadStreamDTO) { return this.delegate.getUploadStream(input) }
  getDownloadStream(input: ProviderGetFileDTO) { return this.delegate.getDownloadStream(input) }
  getAsBuffer(input: ProviderGetFileDTO) { return this.delegate.getAsBuffer(input) }
}

export default StackShiftFileProviderService
