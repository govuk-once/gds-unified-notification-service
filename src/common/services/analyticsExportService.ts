import { CloudWatchLogsClient, CloudWatchLogsServiceException, CreateExportTaskCommand, CreateExportTaskCommandInput, CreateLogStreamCommand, PutLogEventsCommand, PutLogEventsCommandInput } from "@aws-sdk/client-cloudwatch-logs";
import { InvalidCharacterError } from "@common/models/Errors/BadRequestError";
import { ParsingFailedError } from "@common/models/Errors/InternalServerError";
import { CacheService } from "@common/services/cacheService";
import { ConfigurationService } from "@common/services/configurationService";
import { ObservabilityService } from "@common/services/observabilityService";
import { StringParameters } from "@common/utils";
import { IAnalytics } from "@project/lambdas/interfaces/IAnalyticsSchema";

export interface AnalyticsLog {
  EventID: string,
  EventTimestamp: string,
  OrganisationID: string,
  DepartmentID?: string,
  NotificationID: string,
  CampaignID?: string,
  EventStatus: string,
}

export class AnalyticsExportService {
  private logGroupName: string;

  private readonly logStreamCacheKeyPrefix = `analyticsExportService/LogStream`;

  constructor(
    private readonly observability: ObservabilityService,
    private readonly config: ConfigurationService,
    private readonly cache: CacheService,
    private readonly client: CloudWatchLogsClient,
  ) {}

  public async initialize() {
    this.logGroupName = await this.config.getParameter(StringParameters.AnalyticsExport.LogGroup.Name);
    this.observability.tracer.captureAWSv3Client(this.client);

    return this;
  }

  private async getLogStreamName() {
    // Create a new log stream if one doesn't exist
    const logStreamName = new Date().toISOString().split(':').shift() ?? '';

    return await this.cache.get(`${this.logStreamCacheKeyPrefix}:${logStreamName}`, { factory: async (): Promise<string> => {
      try {
        const input = {
          logGroupName: this.logGroupName,
          logStreamName: logStreamName,
        };

        this.observability.logger.debug(`Creating new log stream`, { logStreamName });
        const command = new CreateLogStreamCommand(input);
        await this.client.send(command);
        this.observability.logger.debug(`New log stream was created`, { logStreamName });
      } catch (error) {
        if (error instanceof CloudWatchLogsServiceException && error.name === 'ResourceAlreadyExistsException') {
          this.observability.logger.debug(`Log stream already exists`, { logStreamName });
        } else {
          this.observability.logger.error(`Error creating log stream`, { error });
          throw error
        }
      }

      return logStreamName
    },
    ttlSeconds: 7200
    });
  }

  public async logAnalytics(analytics: IAnalytics) {
    this.observability.logger.debug(`Adding analytics to Cloudwatch log group`, { analytics });
    const logStreamName = await this.getLogStreamName()
    const log = this.analyticsToCsvLog(analytics);

    // Push analytics to log group and stream
    const input: PutLogEventsCommandInput = {
      logGroupName: this.logGroupName,
      logStreamName: logStreamName,
      logEvents: [
        {
          timestamp: Date.now(),
          message: log,
        },
      ],
    };
    const command = new PutLogEventsCommand(input);

    this.observability.logger.debug(`Adding analytics in csv format to log group`, { LogStream: logStreamName, log });
    await this.client.send(command);
    this.observability.logger.debug(`Analytics was successful added to log group`, { LogStream: logStreamName });
  }

  public async logStreamToS3Bucket(timestamp: string) {
    this.observability.logger.debug(`Exporting log group to s3 bucket`, { timestamp });
    const exportBucketName = await this.config.getParameter(StringParameters.AnalyticsExport.Bucket.Name);

    // Determines the log stream name off the timestamp from event bridge
    if (Number.isNaN(Date.parse(timestamp))) {
      this.observability.logger.error("Timestamp used is not a valid datetime format.", { timestamp })
      throw new ParsingFailedError()
    }
    const logStreamName = timestamp.split(':').shift();
    const time = new Date(timestamp).getTime();

    // Export analytics from log group to s3 bucket
    const input: CreateExportTaskCommandInput = {
      taskName: `analytics-export-${logStreamName}`,
      logGroupName: this.logGroupName,
      logStreamNamePrefix: logStreamName,
      // Gives a 2 hours buffer window - however shouldn't fall outside the log stream window
      from: time - 2 * 60 * 60 * 1000,
      to: time,
      destination: exportBucketName,
      destinationPrefix: logStreamName,
    };
    const command = new CreateExportTaskCommand(input);

    this.observability.logger.debug(`Started export of log stream to s3 bucket`, { LogStream: logStreamName, s3Bucket: exportBucketName });
    await this.client.send(command);
    this.observability.logger.debug(`Export of log stream to s3 bucket was successful`, { LogStream: logStreamName, s3Bucket: exportBucketName });
  }

  private analyticsToCsvLog(analytics: IAnalytics): string {
    this.observability.logger.debug(`Converting analytics to csv format`, { analytics });

    const analyticsLog: AnalyticsLog = {
      EventID: analytics.EventID,
      EventTimestamp: analytics.EventDateTime,
      OrganisationID: analytics.OrganisationID,
      DepartmentID: analytics.DepartmentID,
      NotificationID: analytics.NotificationID,
      CampaignID: analytics.CampaignID,
      EventStatus: analytics.Event,
    }

    for (const [key, value] of Object.entries(analyticsLog)) {
      if (value && ((value as string).includes(`,`) || (value as string).includes(`"`))) {
        const errorMsg = `Analytics contains invalid char , or " for csv format.`
        this.observability.logger.warn(errorMsg, { field: key, analyticsLog});
        throw new InvalidCharacterError([errorMsg]);
      }
    }

    return [
      "",
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      ...Object.values(analyticsLog)
    ].join(",")
  }
}
