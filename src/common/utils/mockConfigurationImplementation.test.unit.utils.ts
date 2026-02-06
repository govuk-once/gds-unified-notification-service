import { BoolParameters, EnumParameters, NumericParameters, StringParameters } from '@common/utils/parameters';

export class MockConfigurationImplementation {
  public stringConfiguration: Record<string, string> = {};
  public booleanConfiguration: Record<string, boolean> = {};
  public enumConfiguration: Record<string, string> = {};
  public numericConfiguration: Record<string, number> = {};
  public typeConfiguration: Record<string, object> = {};

  public setBooleanConfig = (updates: typeof this.booleanConfiguration) =>
    (this.booleanConfiguration = { ...this.booleanConfiguration, ...updates });

  public setEnumConfig = (updates: typeof this.enumConfiguration) =>
    (this.enumConfiguration = { ...this.enumConfiguration, ...updates });

  public setNumericConfig = (updates: typeof this.numericConfiguration) =>
    (this.numericConfiguration = { ...this.numericConfiguration, ...updates });

  public setStringConfig = (updates: typeof this.stringConfiguration) =>
    (this.stringConfiguration = { ...this.stringConfiguration, ...updates });

  public setTypeConfig = (updates: typeof this.typeConfiguration) =>
    (this.typeConfiguration = { ...this.typeConfiguration, ...updates });

  public resetConfig = () => {
    this.booleanConfiguration = {
      [BoolParameters.Config.Common.Enabled]: true,
      [BoolParameters.Config.Dispatch.Enabled]: true,
      [BoolParameters.Config.Processing.Enabled]: true,
      [BoolParameters.Config.Validation.Enabled]: true,
    };
    this.enumConfiguration = {
      [EnumParameters.Config.Dispatch.Adapter]: 'OneSignal',
    };
    this.numericConfiguration = {
      [NumericParameters.Config.Dispatch.NotificationsProviderRateLimitPerMinute]: 100,
    };
    this.stringConfiguration = {
      [StringParameters.Config.Cache.Host]: 'host',
      [StringParameters.Config.Cache.Name]: 'name,',
      [StringParameters.Config.Cache.User]: 'user',
      [StringParameters.Queue.Analytics.Url]: 'sqsurl/sqsanalytics',
      [StringParameters.Queue.Dispatch.Url]: 'sqsurl/sqsdispatch',
      [StringParameters.Queue.Processing.Url]: 'sqsurl/sqsprocessing',
      [StringParameters.Api.PostMessage.ApiKey]: 'mockApiKey',
      [StringParameters.Dispatch.OneSignal.ApiKey]: 'mockOneSignalAppKey',
      [StringParameters.Dispatch.OneSignal.AppId]: 'mockOneSignalAppId',
      [StringParameters.Table.Inbound.Name]: 'mockInboundTableName',
      [StringParameters.Table.Events.Name]: 'mockEventTableName',
    };
    this.typeConfiguration = {
      [StringParameters.Table.Inbound.KeyAttributes]: {
        attributes: ['DepartmentID', 'NotificationID'],
        hashKey: 'NotificationID',
        rangeKey: null,
      },
      [StringParameters.Table.Events.KeyAttributes]: {
        attributes: ['EventID', 'EventDateTime', 'NotificationID', 'DepartmentID'],
        hashKey: 'EventID',
        rangeKey: 'DepartmentID',
      },
    };
  };
}
