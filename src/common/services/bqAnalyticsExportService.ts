import { CloudWatchLogsClient, CloudWatchLogsServiceException, CreateExportTaskCommand, CreateExportTaskCommandInput, CreateLogStreamCommand, PutLogEventsCommand, PutLogEventsCommandInput } from "@aws-sdk/client-cloudwatch-logs";
import { ParsingFailedError } from "@common/models/Errors/InternalServerError";
import { CacheService } from "@common/services/cacheService";
import { ConfigurationService } from "@common/services/configurationService";
import { IAnalyticsToIAnalyticsLog } from "@common/services/interfaces/analyticsLog";
import { ObservabilityService } from "@common/services/observabilityService";
import { StringParameters } from "@common/utils";
import { IAnalytics } from "@project/lambdas/interfaces/IAnalyticsSchema";

export class BqAnalyticsExportService {
  private logGroupName: string;
  private client: CloudWatchLogsClient

  private readonly logStreamCacheKeyPrefix = `bqAnalyticsExportService/LogStream`;

  constructor(
    private readonly observability: ObservabilityService,
    private readonly config: ConfigurationService,
    private readonly cache: CacheService,
  ) {}


  public async initialize() {
    this.logGroupName = await this.config.getParameter(StringParameters.BigQuery.LogGroup.Name);

    this.client = new CloudWatchLogsClient()
    this.observability.tracer.captureAWSv3Client(this.client);

    return this;
  }

  private async getLogStreamName() {
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
    // Create a new log stream if analytics is on a new hour
    const logStreamName = await this.getLogStreamName()
    const log = IAnalyticsToIAnalyticsLog(analytics);

    // Push analytics to log group and stream
    const input: PutLogEventsCommandInput = {
      logGroupName: this.logGroupName,
      logStreamName: logStreamName,
      logEvents: [
        {
          timestamp: Date.now(),
          message: JSON.stringify(log),
        },
      ],
    };
    const command = new PutLogEventsCommand(input);

    this.observability.logger.debug(`Adding analytics to BigQuery export log group`, { LogStream: logStreamName, ...log });
    await this.client.send(command);
    this.observability.logger.debug(`Analytics to log group was successful`, { LogStream: logStreamName });
  }

  public async logStreamToS3Bucket(timestamp: string) {
    const exportBucketName = await this.config.getParameter(StringParameters.BigQuery.Bucket.Name);
    const logStreamName = timestamp.split(':').shift() ?? '';

    if (!logStreamName) {
      this.observability.logger.error('Timestamp string is not in a datetime format', { timestamp })
      throw new ParsingFailedError()
    }

    const time = new Date(timestamp).getTime();

    // Export analytics from log group to s3 bucket
    const input: CreateExportTaskCommandInput = {
      taskName: `bq-analytics-export-${logStreamName}`,
      logGroupName: this.logGroupName,
      logStreamNamePrefix: logStreamName,
      // TODO: Should I add more of a buffer?
      from: time - 60 * 60 * 1000,
      to: time,
      destination: exportBucketName,
      destinationPrefix: logStreamName,
    };
    const command = new CreateExportTaskCommand(input);

    this.observability.logger.debug(`Exporting log stream to s3 bucket`, { LogStream: logStreamName, s3Bucket: exportBucketName });
    await this.client.send(command);
    this.observability.logger.debug(`Export of log stream to s3 bucket was successful`, { LogStream: logStreamName, s3Bucket: exportBucketName });
  }
}
