import { StringSecret } from '@common/utils/secrets';
import SSMParameters from '@shared/ssmParameter';

// Default config values for mocking
// All of the values in SSM are strings
export const mockDefaultConfig = (): Record<string, string | Error> =>
  Object.entries({
    // Strings
    [SSMParameters.Config.Common.Cache.Host.Path]: 'host',
    [SSMParameters.Config.Common.Cache.Name.Path]: 'name,',
    [SSMParameters.Config.Common.Cache.User.Path]: 'user',
    [SSMParameters.Queue.Analytics.Url.Path]: 'sqsurl/sqsanalytics',
    [SSMParameters.Queue.Dispatch.Url.Path]: 'sqsurl/sqsdispatch',
    [SSMParameters.Queue.GroupProcessing.Url.Path]: 'sqsurl/sqsgroupprocessing',
    [SSMParameters.Queue.Processing.Url.Path]: 'sqsurl/sqsprocessing',
    [SSMParameters.Config.Dispatch.OneSignal.AppId.Path]: 'mockOneSignalAppId',
    [SSMParameters.Config.UDP.SM.Path]: JSON.stringify('arn:of:sm:secret'),
    [SSMParameters.AnalyticsExport.LogGroup.Name.Path]: 'mockLogGroupName',
    [SSMParameters.AnalyticsExport.Bucket.Name.Path]: 'mockBucketName',
    // Content filtering
    [SSMParameters.Content.Allowed.Protocols.Path]: 'govuk:,https:',
    [SSMParameters.Content.Allowed.UrlHostnames.Path]: '*.gov.uk',
    [SSMParameters.Notification.DeeplinkTemplate.Path]: 'govuk://notifications?id={id}',
    // Bool params
    [SSMParameters.Config.Common.Enabled.Path]: `true`,
    [SSMParameters.Config.Dispatch.Enabled.Path]: `true`,
    [SSMParameters.Config.Processing.Enabled.Path]: `true`,
    [SSMParameters.Config.GroupProcessingWorker.Enabled.Path]: `true`,
    [SSMParameters.Config.Validation.Enabled.Path]: `true`,
    [SSMParameters.Config.FeatureFlags.DeepLinkUrl.Path]: `true`,
    [SSMParameters.Config.FeatureFlags.ChannelControls.Path]: `true`,
    [SSMParameters.Config.FeatureFlags.MessageRetention.Path]: `true`,
    // Enums
    [SSMParameters.Config.Dispatch.Adapter.Path]: 'OneSignal',
    [SSMParameters.Config.Processing.Adapter.Path]: 'UDP',
    // Numbers
    [SSMParameters.Config.Common.Cache.NotificationsProviderRateLimitPerMinute.Path]: `100`,
    [SSMParameters.Config.Dispatch.CircuitBreaker.Threshold.Path]: `5`,
    [SSMParameters.Config.Dispatch.CircuitBreaker.WindowDuration.Path]: `60`,
    [SSMParameters.Config.Dispatch.CircuitBreaker.HalfOpenAfter.Path]: `30`,
    [SSMParameters.Config.Dispatch.CircuitBreaker.RateLimitWhenOpen.Path]: `5`,
    [SSMParameters.Group.Dispatch.WorkerCount.Path]: `5`,
    [SSMParameters.Group.Dispatch.WorkerBatchSize.Path]: `100`,
    // Nested objects
    [SSMParameters.Table.Inbound.Attributes.Path]: JSON.stringify({
      attributes: ['DepartmentID', 'NotificationID'],
      hashKey: 'NotificationID',
      rangeKey: null,
      name: 'mockNotificationsDynamoRepositoryName',
      expirationAttribute: 'ExpirationDateTime',
      expirationDurationInSeconds: 60 * 60 * 24 * 30,
    }),
    [SSMParameters.Table.MTLSRevocation.Attributes.Path]: JSON.stringify({
      name: 'mockMtlsRevocationTableName',
      attributes: [],
      hashKey: 'Id',
      rangeKey: '',
    }),
    [SSMParameters.Table.Campaigns.Attributes.Path]: JSON.stringify({
      name: 'mockCampaignsDynamoRepositoryName',
      attributes: ['CompositeID'],
      hashKey: 'CompositeID',
      rangeKey: null,
    }),
    [SSMParameters.Table.Organisations.Attributes.Path]: JSON.stringify({
      name: 'mockOrganisationsDynamoRepositoryName',
      attributes: [],
      hashKey: 'OrganisationID',
      rangeKey: null,
    }),
    [SSMParameters.Table.GroupStore.Attributes.Path]: JSON.stringify({
      name: 'mockGroupStoreDynamoRepositoryName',
      attributes: ['CompositeID'],
      hashKey: 'GroupID',
      rangeKey: 'PushID',
    }),
  }).reduce((entries, [key, value]) => ({ ...entries, [key]: value }), {});

export const mockDefaultSecrets = (): Record<string, string | Error> =>
  Object.entries({
    // Strings
    [StringSecret.Dispatch.OneSignal.ApiKey]: 'mockOneSignalAppKey',
  }).reduce((entries, [key, value]) => ({ ...entries, [key]: value }), {});

export const mockDefaultExternalSecrets = (): Record<string, string | Error> =>
  Object.entries({
    // Strings
    ['arn:of:sm:secret']: JSON.stringify({
      apiAccountId: '1231231231',
      apiKey: 'abc',
      apiUrl: 'https://udp',
      consumerRoleArn: 'arn:iam:consumer',
      region: 'eu-west-2',
    }),
  }).reduce((entries, [key, value]) => ({ ...entries, [key]: value }), {});

export const mockGetParameterImplementation = (records: Record<string, string | Error>) => {
  return (parameter: string) => {
    // If the value stored is an error - throw it instead of returning
    if (records[parameter] instanceof Error) {
      throw records[parameter];
    }
    // Otherwise just return value
    return Promise.resolve(records[parameter]);
  };
};
