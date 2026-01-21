import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { NotificationAdapter, NotificationAdapterOneSignal, NotificationAdapterVoid } from '@common/services';
import { Configuration } from '@common/services/configuration';
import { NotificationAdapterRequest } from '@common/services/interfaces';
import { segment } from '@common/utils';
import * as z from 'zod';

export class NotificationService {
  public adapter: NotificationAdapter;
  constructor(
    protected logger: Logger,
    protected metrics: Metrics,
    protected tracer: Tracer,
    protected config: Configuration
  ) {}

  async initialize(): Promise<void> {
    // Based on the adapter configured within SSM - switch adapters
    const adapter = await this.config.getEnumParameter(
      `config/dispatch/adapter`,
      z.enum([`VOID`, `OneSignal`])
    );

    if (adapter == 'VOID') {
      this.adapter = new NotificationAdapterVoid(this.logger, this.metrics, this.tracer, this.config);
      return;
    } else if (adapter == 'OneSignal') {
      this.adapter = new NotificationAdapterOneSignal(this.logger, this.metrics, this.tracer, this.config);
    }

    // Initialize the adapter
    await this.adapter.initialize();
  }

  async send(request: NotificationAdapterRequest): Promise<void> {
    const metadata = {
      NotificationID: request.NotificationID,
    };
    this.logger.info(`Dispatching notification`, metadata);
    await segment(this.tracer, `Dispatching`, async (segment) => {
      segment.addMetadata(`NotificationID`, request.NotificationID);
      segment.addAnnotation(`Start`, true);
      const start = performance.now();
      await this.adapter.send(request);
      const end = performance.now() - start;
      segment.addAnnotation(`End`, true);
      this.metrics.addMetric(`DISPATCH_DURATION`, MetricUnit.Milliseconds, end);
    });
  }
}
