import { ConfigurationService } from '@common/services/configurationService';
import { ProcessingAdapter, ProcessingAdapterRequest, ProcessingAdapterResult } from '@common/services/interfaces';
import { ObservabilityService } from '@common/services/observabilityService';

export class ProcessingAdapterVoid implements ProcessingAdapter {
  constructor(
    protected observability: ObservabilityService,
    protected config: ConfigurationService
  ) {}

  // Empty shim
  async initialize(): Promise<void> {
    await Promise.resolve();
    return;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async send(request: ProcessingAdapterRequest): Promise<ProcessingAdapterResult> {
    this.observability.logger.info(`Processing using Void adapter - mapping userID to externalUserID`, {
      userID: request.userID,
    });
    return {
      request: request,
      success: true,
      externalUserID: request.userID,
    };
  }
}
