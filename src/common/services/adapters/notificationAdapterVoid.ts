import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Configuration } from '@common/services/configuration';
import {
  NotificationAdapter,
  NotificationAdapterRequest,
  NotificationAdapterResult,
} from '@common/services/interfaces';

export class NotificationAdapterVoid implements NotificationAdapter {
  constructor(
    protected logger: Logger,
    protected metrics: Metrics,
    protected tracer: Tracer,
    protected config: Configuration
  ) {}

  // Empty shim
  async initialize(): Promise<void> {
    await Promise.resolve();
    return;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async send(request: NotificationAdapterRequest): Promise<NotificationAdapterResult> {
    const metadata = {
      NotificationID: request.NotificationID,
    };
    this.logger.info(`Sending notification using Void adapter`, metadata);
    return {
      notification: request,
      success: true,
    };
  }
}
