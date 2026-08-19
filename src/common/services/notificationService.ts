import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  ConfigurationService,
  MetricsLabels,
  NotificationAdapterOneSignal,
  NotificationAdapterVoid,
  ObservabilityService,
} from '@common/services';
import { NotificationAdapterRequest, NotificationAdapterResult } from '@common/services/interfaces';
import { SMNamespacedConfigurationService } from '@common/services/smNamespacedConfigurationService';
import { BoolParameters, EnumParameters, segment } from '@common/utils';
import * as z from 'zod';

export class NotificationService {
  public voidAdapter!: NotificationAdapterVoid;
  public onesignalAdapter?: NotificationAdapterOneSignal;

  protected featureFlagChannelControls!: boolean;

  constructor(
    protected observability: ObservabilityService,
    protected config: ConfigurationService,
    protected smConfig: SMNamespacedConfigurationService
  ) {}

  async initialize() {
    // Based on the adapter configured within SSM - switch adapters
    const defaultAdapter = await this.config.getEnumParameter(
      EnumParameters.Config.Dispatch.Adapter,
      z.enum([`VOID`, `OneSignal`])
    );
    this.featureFlagChannelControls = await this.config.getBooleanParameter(
      BoolParameters.Config.FeatureFlags.ChannelControls
    );

    // Initialize the adapters
    this.voidAdapter = new NotificationAdapterVoid(this.observability, this.config, this.smConfig);
    await this.voidAdapter.initialize();

    if (defaultAdapter === 'OneSignal') {
      this.onesignalAdapter = new NotificationAdapterOneSignal(this.observability, this.config, this.smConfig);
      await this.onesignalAdapter.initialize();
    }

    return this;
  }

  async send(request: NotificationAdapterRequest): Promise<NotificationAdapterResult> {
    const metadata = {
      NotificationID: request.NotificationID,
    };

    // Chooses which adapter to use based off channel, defaults to OneSignal
    let adapter = this.onesignalAdapter ?? this.voidAdapter;
    if (this.featureFlagChannelControls && request.Channel && this.onesignalAdapter) {
      switch (request.Channel) {
        case this.onesignalAdapter.supportedChannels:
          adapter = this.onesignalAdapter;
          break;
        case this.voidAdapter.supportedChannels:
          adapter = this.voidAdapter;
          break;
        default:
          break;
      }
    }

    this.observability.logger.info(`Dispatching notification`, metadata);
    const start = performance.now();
    this.observability.metrics.addMetric(MetricsLabels.DISPATCHING_ATTEMPTS, MetricUnit.Count, 1);

    const result = await segment(this.observability.tracer, `Dispatching`, async (segment) => {
      segment.addMetadata(`NotificationID`, request.NotificationID);
      segment.addAnnotation(`Start`, true);

      return await adapter.send(request);
    });

    const end = performance.now() - start;
    this.observability.metrics.addMetric(MetricsLabels.DISPATCH_DURATION, MetricUnit.Milliseconds, end);
    this.observability.metrics.addMetric(MetricsLabels.DISPATCHED, MetricUnit.Count, 1);

    return result;
  }
}
