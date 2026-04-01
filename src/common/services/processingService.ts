import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  ConfigurationService,
  ObservabilityService,
  ProcessingAdapterUDP,
  ProcessingAdapterVoid,
} from '@common/services';
import { ProcessingAdapter, ProcessingAdapterRequest, ProcessingAdapterResult } from '@common/services/interfaces';
import { SMConfigurationService } from '@common/services/smConfigurationService';
import { EnumParameters } from '@common/utils';
import * as z from 'zod';

export class ProcessingService {
  public adapter: ProcessingAdapter;
  constructor(
    protected observability: ObservabilityService,
    protected config: ConfigurationService,
    protected smConfig: SMConfigurationService
  ) {}

  async initialize() {
    // Based on the adapter configured within SSM - switch adapters
    const adapter = await this.config.getEnumParameter(
      EnumParameters.Config.Processing.Adapter,
      z.enum([`VOID`, `UDP`])
    );

    // Select adapter based on the configuration
    this.adapter =
      adapter == 'UDP'
        ? new ProcessingAdapterUDP(
            this.observability.logger,
            this.observability.metrics,
            this.observability.tracer,
            this.config,
            this.smConfig
          )
        : new ProcessingAdapterVoid(
            this.observability.logger,
            this.observability.metrics,
            this.observability.tracer,
            this.config
          );

    // Initialize the adapter
    await this.adapter.initialize();

    return this;
  }

  async send(request: ProcessingAdapterRequest): Promise<ProcessingAdapterResult> {
    this.observability.logger.info(`Looking up user id`, { userID: request.userID });
    this.observability.metrics.addMetric(`PRORCESSING_ATTEMPTS`, MetricUnit.Count, 1);
    const start = performance.now();
    const result = await this.adapter.send(request);
    this.observability.metrics.addMetric(`PRORCESSING_DURATION`, MetricUnit.Milliseconds, performance.now() - start);
    this.observability.metrics.addMetric(`PRORCESSED`, MetricUnit.Count, 1);
    return result;
  }
}
