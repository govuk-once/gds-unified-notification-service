import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { NotificationAdapterOneSignal, NotificationAdapterVoid } from '@common/services/adapters';
import { ConfigurationService } from '@common/services/configurationService';
import {
  NotificationAdapter,
  NotificationAdapterRequest,
  NotificationAdapterResult,
} from '@common/services/interfaces';
import { MetricsLabels, ObservabilityService } from '@common/services/observabilityService';
import { SMNamespacedConfigurationService } from '@common/services/smNamespacedConfigurationService';
import { EnumParameters, segment } from '@common/utils';
import z from 'zod';

export class NotificationService {
  constructor(
    public adapter: NotificationAdapter,
    protected observability: ObservabilityService,
    protected config: ConfigurationService
  ) {}

  public static async create(
    observability: ObservabilityService,
    config: ConfigurationService,
    smConfig: SMNamespacedConfigurationService
  ) {
    // Based on the adapter configured within SSM - switch adapters
    const adapterConfig = await config.getEnumParameter(
      EnumParameters.Config.Dispatch.Adapter,
      z.enum([`VOID`, `OneSignal`])
    );

    // Select adapter based on the configuration
    const adapter =
      adapterConfig == 'OneSignal'
        ? await NotificationAdapterOneSignal.create(observability, config, smConfig)
        : NotificationAdapterVoid.create(observability, config);

    return new NotificationService(adapter, observability, config);
  }

  async send(request: NotificationAdapterRequest): Promise<NotificationAdapterResult> {
    const metadata = {
      NotificationID: request.NotificationID,
    };

    this.observability.logger.info(`Dispatching notification`, metadata);
    const start = performance.now();

    this.observability.metrics.addMetric(MetricsLabels.DISPATCHING_ATTEMPTS, MetricUnit.Count, 1);
    const result = await segment(this.observability.tracer, `Dispatching`, async (segment) => {
      segment.addMetadata(`NotificationID`, request.NotificationID);
      segment.addAnnotation(`Start`, true);
      return await this.adapter.send(request);
    });

    const end = performance.now() - start;
    this.observability.metrics.addMetric(MetricsLabels.DISPATCH_DURATION, MetricUnit.Milliseconds, end);
    this.observability.metrics.addMetric(MetricsLabels.DISPATCHED, MetricUnit.Count, 1);

    return result;
  }
}
