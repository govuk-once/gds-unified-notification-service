import { HandlerDependencies, iocGetBqAnalyticsExportService, iocGetConfigurationService, iocGetObservabilityService,  } from "@common/ioc";
import { ScheduleOperation } from "@common/operations/scheduleOperation";
import { ConfigurationService, ObservabilityService, BqAnalyticsExportService } from "@common/services";
import { Context, ScheduledEvent } from "aws-lambda";

export class BqAnalyticsExport extends ScheduleOperation {
  public operationId: string = 'bqAnalyticsExport';

  public bqAnalyticsExportService: BqAnalyticsExportService;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    dependencies?: () => HandlerDependencies<BqAnalyticsExport>
  ) {
    super(observability);
    this.injectDependencies(dependencies);
  }
  
  public async implementation(
    event: ScheduledEvent,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: Context
  ): Promise<void> {
    await this.bqAnalyticsExportService.logStreamToS3Bucket(event.time)
  }
}

export const handler = new BqAnalyticsExport(iocGetConfigurationService(), iocGetObservabilityService(), () => ({
  bqAnalyticsExportService: iocGetBqAnalyticsExportService()
})).handler();
