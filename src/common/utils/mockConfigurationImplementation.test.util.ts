import { BoolParameters, EnumParameters, NumericParameters, StringParameters } from '@common/utils/parameters';

// Default config values for mocking
// All of the values in SSM are strings
export const mockDefaultConfig = (): Record<string, string | Error> =>
  Object.entries({
    // Strings
    [StringParameters.Config.Cache.Host]: 'host',
    [StringParameters.Config.Cache.Name]: 'name,',
    [StringParameters.Config.Cache.User]: 'user',
    [StringParameters.Queue.Analytics.Url]: 'sqsurl/sqsanalytics',
    [StringParameters.Queue.Dispatch.Url]: 'sqsurl/sqsdispatch',
    [StringParameters.Queue.Processing.Url]: 'sqsurl/sqsprocessing',
    [StringParameters.Dispatch.OneSignal.ApiKey]: 'mockOneSignalAppKey',
    [StringParameters.Dispatch.OneSignal.AppId]: 'mockOneSignalAppId',
    [StringParameters.UDP.Config.SM]: JSON.stringify('arn:of:sm:secret'),
    // Content filtering
    [StringParameters.Content.Allowed.Protocols]: 'govuk:,https:',
    [StringParameters.Content.Allowed.UrlHostnames]: '*.gov.uk',
    [StringParameters.Notification.DeeplinkTemplate]: 'govuk://notifications?id={id}',
    // Bool params
    [BoolParameters.Config.Common.Enabled]: `true`,
    [BoolParameters.Config.Dispatch.Enabled]: `true`,
    [BoolParameters.Config.Processing.Enabled]: `true`,
    [BoolParameters.Config.Validation.Enabled]: `true`,
    // Enums
    [EnumParameters.Config.Dispatch.Adapter]: 'OneSignal',
    [EnumParameters.Config.Processing.Adapter]: 'UDP',
    // Numbers
    [NumericParameters.Config.Dispatch.NotificationsProviderRateLimitPerMinute]: `100`,
    [NumericParameters.CircuitBreaker.Threshold]: `5`,
    [NumericParameters.CircuitBreaker.WindowDuration]: `60`,
    [NumericParameters.CircuitBreaker.HalfOpenAfter]: `30`,
    [NumericParameters.CircuitBreaker.RateLimitWhenOpen]: `5`,
    // Nested objects
    [StringParameters.Table.Inbound.Attributes]: JSON.stringify({
      attributes: ['DepartmentID', 'NotificationID'],
      hashKey: 'NotificationID',
      rangeKey: '',
      name: 'mockNotificationsDynamoRepositoryName',
      expirationAttribute: 'ExpirationDateTime',
      expirationDurationInSeconds: 60 * 60 * 24 * 30,
    }),
    [StringParameters.Table.MTLSRevocation.Attributes]: JSON.stringify({
      name: 'mockMtlsRevocationTableName',
      attributes: [],
      hashKey: 'Id',
      rangeKey: '',
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
