import { AbstractNotificationProviderService } from "@medusajs/framework/utils"
import type {
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import { StackShiftNotificationProvider } from "./provider.js"
import type {
  LoggerLike,
  StackShiftNotificationOptions,
} from "./types.js"

interface Dependencies {
  logger?: LoggerLike
}

export class StackShiftNotificationProviderService extends AbstractNotificationProviderService {
  static readonly identifier = StackShiftNotificationProvider.identifier
  private readonly delegate: StackShiftNotificationProvider

  static validateOptions(options: StackShiftNotificationOptions): void {
    StackShiftNotificationProvider.validateOptions(options)
  }

  constructor(container: Dependencies, options: StackShiftNotificationOptions) {
    super()
    this.delegate = new StackShiftNotificationProvider(
      { ...options, fetch: options.fetch ?? globalThis.fetch },
      { logger: container.logger },
    )
  }

  send(input: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
    return this.delegate.send(input)
  }
}

export default StackShiftNotificationProviderService
