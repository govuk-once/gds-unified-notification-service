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

  public analyticsExportService: AnalyticsExportService;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    dependencies?: () => HandlerDependencies<AnalyticsExport>
  ) {
    super(observability);
    this.injectDependencies(dependencies);
  }

  public async implementation(
    event: ScheduledEvent,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: Context
  ): Promise<void> {
    await this.analyticsExportService.logStreamToS3Bucket(event.time);
  }
}

export const handler = new AnalyticsExport(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  analyticsExportService: iocGetAnalyticsExportService(),
})).handler();
