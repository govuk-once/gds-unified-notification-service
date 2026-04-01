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
    [StringParameters.Table.Inbound.Name]: 'mocknotificationsDynamoRepositoryName',
    [StringParameters.Table.Inbound.Expiration.Atttribute]: 'ExpirationDateTime',
    [StringParameters.Table.MTLSRevocation.Name]: 'mockMtlsRevocationTableName',
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
    [NumericParameters.Table.Inbound.Expiration.DurationInSeconds]: (60 * 60 * 24 * 30).toString(),
    [NumericParameters.Config.Dispatch.NotificationsProviderRateLimitPerMinute]: `100`,
    // Nested objects
    [StringParameters.Table.Inbound.KeyAttributes]: JSON.stringify({
      attributes: ['DepartmentID', 'NotificationID'],
      hashKey: 'NotificationID',
      rangeKey: null,
    }),
    [StringParameters.Table.MTLSRevocation.KeyAttributes]: JSON.stringify({
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
