import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  ConfigurationService,
  NotificationAdapter,
  NotificationAdapterOneSignal,
  NotificationAdapterVoid,
  ObservabilityService,
} from '@common/services';
import { NotificationAdapterRequest, NotificationAdapterResult } from '@common/services/interfaces';
import { segment } from '@common/utils';
import * as z from 'zod';

export class NotificationService {
  public adapter: NotificationAdapter;
  constructor(
    protected observability: ObservabilityService,
    protected config: ConfigurationService
  ) {}

  async initialize() {
    // Based on the adapter configured within SSM - switch adapters
    const adapter = await this.config.getEnumParameter(`config/dispatch/adapter`, z.enum([`VOID`, `OneSignal`]));

    this.adapter =
      adapter == 'OneSignal'
        ? new NotificationAdapterOneSignal(
            this.observability.logger,
            this.observability.metrics,
            this.observability.tracer,
            this.config
          )
        : new NotificationAdapterVoid(
            this.observability.logger,
            this.observability.metrics,
            this.observability.tracer,
            this.config
          );

    // Initialize the adapter
    await this.adapter.initialize();

    return this;
  }

  async send(request: NotificationAdapterRequest): Promise<NotificationAdapterResult> {
    const metadata = {
      NotificationID: request.NotificationID,
    };
    this.observability.logger.info(`Dispatching notification`, metadata);
    const start = performance.now();
    const result = await segment(this.observability.tracer, `Dispatching`, async (segment) => {
      segment.addMetadata(`NotificationID`, request.NotificationID);
      segment.addAnnotation(`Start`, true);
      return await this.adapter.send(request);
    });
    const end = performance.now() - start;
    this.observability.metrics.addMetric(`DISPATCH_DURATION`, MetricUnit.Milliseconds, end);

    return result;
  }
}
