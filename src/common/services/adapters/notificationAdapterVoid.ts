import { ChannelsEnum } from '@common/models';
import { ConfigurationService } from '@common/services/configurationService';
import {
  NotificationAdapter,
  NotificationAdapterRequest,
  NotificationAdapterResult,
} from '@common/services/interfaces';
import { ObservabilityService } from '@common/services/observabilityService';
import { SMNamespacedConfigurationService } from '@common/services/smNamespacedConfigurationService';

export class NotificationAdapterVoid implements NotificationAdapter {
  public supportedChannels: ChannelsEnum = ChannelsEnum.MESSAGE_CENTRE_ONLY;

  constructor(
    protected observability: ObservabilityService,
    protected config: ConfigurationService,
    protected smConfig: SMNamespacedConfigurationService
  ) {}

  // Empty shim
  async initialize(): Promise<void> {
    await Promise.resolve();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async send(request: NotificationAdapterRequest): Promise<NotificationAdapterResult> {
    const metadata = {
      NotificationID: request.NotificationID,
    };
    this.observability.logger.info(`Sending notification using Void adapter`, metadata);

    return {
      notification: request,
      requestId: request.ExternalUserID,
    };
  }
}
