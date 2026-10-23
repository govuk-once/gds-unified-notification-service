import {
  HandlerDependencies,
  iocGetAnalyticsExportService,
  iocGetConfigurationService,
  iocGetObservabilityService,
} from '@common/ioc';
import { ScheduleOperation } from '@common/operations/scheduleOperation';
import { AnalyticsExportService, ConfigurationService, ObservabilityService } from '@common/services';
import { Context, ScheduledEvent } from 'aws-lambda';

export class AnalyticsExport extends ScheduleOperation {
  public operationId: string = 'analyticsExport';

  public analyticsExportService!: AnalyticsExportService;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    dependencies?: () => HandlerDependencies<AnalyticsExport>
  ) {
    super(observability);
    this.injectDependencies(dependencies);
  }

  public async implementation(event: ScheduledEvent, context: Context): Promise<void> {
    this.observability.logger.info('Received request', {
      path: event.time,
      requestId: context.awsRequestId,
    });

    await this.analyticsExportService.logStreamToS3Bucket(event.time);

    this.observability.logger.info('Successful scheduled processing');
  }
}

export const handler = new AnalyticsExport(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  analyticsExportService: iocGetAnalyticsExportService(),
})).handler();
