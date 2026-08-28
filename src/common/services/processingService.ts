import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { ProcessingAdapterUDP, ProcessingAdapterVoid } from '@common/services/adapters';
import { ConfigurationService } from '@common/services/configurationService';
import { ProcessingAdapter, ProcessingAdapterRequest, ProcessingAdapterResult } from '@common/services/interfaces';
import { MetricsLabels, ObservabilityService } from '@common/services/observabilityService';
import { SMConfigurationService } from '@common/services/smConfigurationService';
import { EnumParameters } from '@common/utils';
import * as z from 'zod';

export class ProcessingService {
  constructor(
    public readonly adapter: ProcessingAdapter,
    protected readonly observability: ObservabilityService
  ) {}

  public static async create(
    observability: ObservabilityService,
    config: ConfigurationService,
    smConfig: SMConfigurationService
  ) {
    // Based on the adapter configured within SSM - switch adapters
    const adapterConfig = await config.getEnumParameter(
      EnumParameters.Config.Processing.Adapter,
      z.enum([`VOID`, `UDP`])
    );

    // Select adapter based on the configuration
    const adapter =
      adapterConfig == 'UDP'
        ? await ProcessingAdapterUDP.create(observability, config, smConfig)
        : ProcessingAdapterVoid.create(observability, config);

    return new ProcessingService(adapter, observability);
  }

  async send(request: ProcessingAdapterRequest): Promise<ProcessingAdapterResult> {
    this.observability.logger.info(`Looking up user id`, { userID: request.userID });
    this.observability.metrics.addMetric(MetricsLabels.PROCESSING_ATTEMPTS, MetricUnit.Count, 1);
    const start = performance.now();
    const result = await this.adapter.send(request);
    this.observability.metrics.addMetric(
      MetricsLabels.PROCESSING_DURATION,
      MetricUnit.Milliseconds,
      performance.now() - start
    );
    this.observability.metrics.addMetric(MetricsLabels.PROCESSED, MetricUnit.Count, 1);
    return result;
  }
}
