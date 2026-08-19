// Unbound methods are allowed as that's how vi.mocked works
import { ChannelsEnum } from '@common/models';
import { BadGatewayError } from '@common/models/Errors';
import { NotificationAdapterOneSignal, NotificationAdapterVoid, NotificationService } from '@common/services';
import { NotificationAdapterRequest } from '@common/services/interfaces';
import { BoolParameters, EnumParameters, StringParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockDefaultSecrets,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { StringSecret } from '@common/utils/secrets';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });
vi.mock('@common/services/smNamespacedConfigurationService', { spy: true });
vi.mock('@common/adapters/notificationAdapterOneSignal', { spy: true });

describe('NotificationService', () => {
  let instance: NotificationService;

  // Initialize the mock service and repository layers
  const observabilityMock = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMock);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();
  let mockSecrets = mockDefaultSecrets();

  const mockRequest = {
    NotificationID: 'test01',
    ExternalUserID: 'sample_external_user_id',
    NotificationTitle: 'UNS Test 01 - Title',
    NotificationBody: 'UNS Test 01 - Body',
  };

  beforeEach(() => {
    // Reset all mock
    vi.clearAllMocks();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );
    mockSecrets = mockDefaultSecrets();
    serviceMocks.smNamespacedConfigurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockSecrets)
    );

    instance = new NotificationService(
      observabilityMock,
      serviceMocks.configurationServiceMock,
      serviceMocks.smNamespacedConfigurationServiceMock
    );
  });

  describe('initialize', () => {
    it('should fetch data from configuration service, initialize void but not onesignal adapter when (void)', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'VOID';

      // Act
      await instance.initialize();

      // Assert
      expect(serviceMocks.configurationServiceMock.getEnumParameter).toHaveBeenCalledTimes(1);
      expect(instance.voidAdapter instanceof NotificationAdapterVoid).toEqual(true);
      expect(instance.onesignalAdapter instanceof NotificationAdapterVoid).toEqual(false);
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledTimes(2);
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith(
        EnumParameters.Config.Dispatch.Adapter
      ); // Void Adapter should make not further param calls
    });

    it('should fetch data from configuration service and initialize void and onesignal adapter when (onesignal)', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      const expectedParamCalls = [
        EnumParameters.Config.Dispatch.Adapter,
        StringParameters.Dispatch.OneSignal.AppId,
        StringParameters.Notification.DeeplinkTemplate,
        BoolParameters.Config.FeatureFlags.ChannelControls,
      ];

      // Act
      await instance.initialize();

      // Assert
      expect(serviceMocks.configurationServiceMock.getEnumParameter).toHaveBeenCalledTimes(1); //
      expect(instance.voidAdapter instanceof NotificationAdapterVoid).toEqual(true);
      expect(instance.onesignalAdapter instanceof NotificationAdapterOneSignal).toEqual(true);
      for (const param of expectedParamCalls) {
        expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith(param);
      }
      expect(serviceMocks.smNamespacedConfigurationServiceMock.getParameter).toHaveBeenCalledWith(
        StringSecret.Dispatch.OneSignal.ApiKey
      );
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledTimes(expectedParamCalls.length);
    });
  });

  describe('send', () => {
    it('Sends a request to the void when adapter is set to Void', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'VOID';

      // Act
      await instance.initialize();
      await instance.send(mockRequest);

      // Assert
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Dispatching notification`, {
        NotificationID: mockRequest.NotificationID,
      });
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Sending notification using Void adapter`, {
        NotificationID: mockRequest.NotificationID,
      });
    });

    it('Sends a request to the void when channel controls are disabled and  adapter is set to Void', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'VOID';
      mockParameterStore[BoolParameters.Config.FeatureFlags.ChannelControls] = 'false';

      // Act
      await instance.initialize();
      await instance.send(mockRequest);

      // Assert
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Dispatching notification`, {
        NotificationID: mockRequest.NotificationID,
      });
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Sending notification using Void adapter`, {
        NotificationID: mockRequest.NotificationID,
      });
    });

    it('Sends a request to onesignal when adapter is set to onesignal and parses valid response', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      mockParameterStore[StringParameters.Dispatch.OneSignal.AppId] = 'ONESIGNAL_APP_ID';

      mockSecrets[StringSecret.Dispatch.OneSignal.ApiKey] = 'ONESIGNAL_DEV_API_KEY_SUCCESS_SCENARIO_01';

      // Act
      await instance.initialize();
      await instance.send(mockRequest);

      // Assert
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Dispatching notification`, {
        NotificationID: mockRequest.NotificationID,
      });
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Sending notification using OneSignal adapter`, {
        NotificationID: mockRequest.NotificationID,
      });
    });

    it('Sends a request to onesignal when channel controls are disabled and adapter is set to onesignal', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      mockParameterStore[StringParameters.Dispatch.OneSignal.AppId] = 'ONESIGNAL_APP_ID';
      mockParameterStore[BoolParameters.Config.FeatureFlags.ChannelControls] = 'false';

      mockSecrets[StringSecret.Dispatch.OneSignal.ApiKey] = 'ONESIGNAL_DEV_API_KEY_SUCCESS_SCENARIO_01';

      // Act
      await instance.initialize();
      await instance.send(mockRequest);

      // Assert
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Dispatching notification`, {
        NotificationID: mockRequest.NotificationID,
      });
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Sending notification using OneSignal adapter`, {
        NotificationID: mockRequest.NotificationID,
      });
    });

    it('Sends a request to onesignal with a deeplink pointing at notification id', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      mockParameterStore[StringParameters.Dispatch.OneSignal.AppId] = 'ONESIGNAL_APP_ID';
      mockSecrets[StringSecret.Dispatch.OneSignal.ApiKey] = 'ONESIGNAL_DEV_API_KEY_SUCCESS_SCENARIO_01';

      await instance.initialize();
      const postSpy = vi.spyOn((instance.onesignalAdapter as NotificationAdapterOneSignal).client, 'post');

      // Act
      await instance.send(mockRequest);

      // Assert
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ data: { deeplink: 'govuk://notifications?id=test01' } }),
          path: '/notifications?c=push',
        })
      );
    });

    it('Sends a request to onesignal and logs errors before throwing an exception', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      mockParameterStore[StringParameters.Dispatch.OneSignal.AppId] = 'ONESIGNAL_APP_ID';

      mockSecrets[StringSecret.Dispatch.OneSignal.ApiKey] = 'ONESIGNAL_DEV_API_KEY_ERROR_SCENARIO_01';

      // Act
      await instance.initialize();
      const result = instance.send(mockRequest);

      // Assert
      await expect(result).rejects.toThrow(new BadGatewayError(['API [POST] /notifications?c=push Failed with 400']));
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Dispatching notification`, {
        NotificationID: mockRequest.NotificationID,
      });
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Sending notification using OneSignal adapter`, {
        NotificationID: mockRequest.NotificationID,
      });
      expect(observabilityMock.logger.error).toHaveBeenCalledWith(
        `Failed to dispatch notification using OneSignal adapter`,
        {
          NotificationID: mockRequest.NotificationID,
          error: {
            message: 'API [POST] /notifications?c=push Failed with 400',
            name: 'Error',
            response:
              '{"errors":["Request is malformed: Failed to parse app_id from request","Failed to parse app_id from request (app_id is present but malformed)"]}',
            status: 400,
          },
        }
      );
    });

    it('Sends a request to onesignal when channel controls are enabled and channel in message is PUSH_NOTIFICATION_AND_MESSAGE_CENTRE', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      mockParameterStore[StringParameters.Dispatch.OneSignal.AppId] = 'ONESIGNAL_APP_ID';
      mockParameterStore[BoolParameters.Config.FeatureFlags.ChannelControls] = 'true';

      mockSecrets[StringSecret.Dispatch.OneSignal.ApiKey] = 'ONESIGNAL_DEV_API_KEY_SUCCESS_SCENARIO_01';

      const mockRequestWithPushNotification = {
        ...mockRequest,
        Channel: ChannelsEnum.PUSH_NOTIFICATION_AND_MESSAGE_CENTRE,
      };

      // Act
      await instance.initialize();
      await instance.send(mockRequestWithPushNotification);

      // Assert
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Dispatching notification`, {
        NotificationID: mockRequest.NotificationID,
      });
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Sending notification using OneSignal adapter`, {
        NotificationID: mockRequest.NotificationID,
      });
    });

    it('Sends a request to void when channel controls are enabled and channel in message is MESSAGE_CENTRE_ONLY', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      mockParameterStore[StringParameters.Dispatch.OneSignal.AppId] = 'ONESIGNAL_APP_ID';
      mockParameterStore[BoolParameters.Config.FeatureFlags.ChannelControls] = 'true';

      mockSecrets[StringSecret.Dispatch.OneSignal.ApiKey] = 'ONESIGNAL_DEV_API_KEY_SUCCESS_SCENARIO_01';

      const mockRequestWithPushNotification = {
        ...mockRequest,
        Channel: ChannelsEnum.MESSAGE_CENTRE_ONLY,
      };

      // Act
      await instance.initialize();
      await instance.send(mockRequestWithPushNotification);

      // Assert
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Dispatching notification`, {
        NotificationID: mockRequest.NotificationID,
      });
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Sending notification using Void adapter`, {
        NotificationID: mockRequest.NotificationID,
      });
    });

    it('Sends a request to void when default adapter is void channel controls are enabled and channel in message is PUSH_NOTIFICATION_AND_MESSAGE_CENTRE', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      mockParameterStore[StringParameters.Dispatch.OneSignal.AppId] = 'ONESIGNAL_APP_ID';
      mockParameterStore[BoolParameters.Config.FeatureFlags.ChannelControls] = 'true';

      mockSecrets[StringSecret.Dispatch.OneSignal.ApiKey] = 'ONESIGNAL_DEV_API_KEY_SUCCESS_SCENARIO_01';

      const mockRequestWithPushNotification = {
        ...mockRequest,
        Channel: ChannelsEnum.MESSAGE_CENTRE_ONLY,
      };

      // Act
      await instance.initialize();
      await instance.send(mockRequestWithPushNotification);

      // Assert
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Dispatching notification`, {
        NotificationID: mockRequest.NotificationID,
      });
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Sending notification using Void adapter`, {
        NotificationID: mockRequest.NotificationID,
      });
    });

    it('Sends a request to void when default adapter is void, channel controls are enabled, but channel is undefined', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'VOID';
      mockParameterStore[StringParameters.Dispatch.OneSignal.AppId] = 'ONESIGNAL_APP_ID';
      mockParameterStore[BoolParameters.Config.FeatureFlags.ChannelControls] = 'true';

      mockSecrets[StringSecret.Dispatch.OneSignal.ApiKey] = 'ONESIGNAL_DEV_API_KEY_SUCCESS_SCENARIO_01';

      // Act
      await instance.initialize();
      await instance.send(mockRequest);

      // Assert
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Dispatching notification`, {
        NotificationID: mockRequest.NotificationID,
      });
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Sending notification using Void adapter`, {
        NotificationID: mockRequest.NotificationID,
      });
    });

    it('Sends a request to onesignal when default adapter is onesignal, channel controls are enabled, but channel is undefined', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      mockParameterStore[StringParameters.Dispatch.OneSignal.AppId] = 'ONESIGNAL_APP_ID';
      mockParameterStore[BoolParameters.Config.FeatureFlags.ChannelControls] = 'true';

      mockSecrets[StringSecret.Dispatch.OneSignal.ApiKey] = 'ONESIGNAL_DEV_API_KEY_SUCCESS_SCENARIO_01';

      // Act
      await instance.initialize();
      await instance.send(mockRequest);

      // Assert
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Dispatching notification`, {
        NotificationID: mockRequest.NotificationID,
      });
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Sending notification using OneSignal adapter`, {
        NotificationID: mockRequest.NotificationID,
      });
    });

    it('Sends a request to onesignal when default adapter is onesignal, channel controls are enabled, but channel is an invalid enum', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      mockParameterStore[StringParameters.Dispatch.OneSignal.AppId] = 'ONESIGNAL_APP_ID';
      mockParameterStore[BoolParameters.Config.FeatureFlags.ChannelControls] = 'true';

      mockSecrets[StringSecret.Dispatch.OneSignal.ApiKey] = 'ONESIGNAL_DEV_API_KEY_SUCCESS_SCENARIO_01';

      const mockRequestWithInvalidEnum = {
        ...mockRequest,
        Channel: 'INVALID_ENUM',
      } as unknown as NotificationAdapterRequest;

      // Act
      await instance.initialize();
      await instance.send(mockRequestWithInvalidEnum);

      // Assert
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Dispatching notification`, {
        NotificationID: mockRequest.NotificationID,
      });
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Sending notification using OneSignal adapter`, {
        NotificationID: mockRequest.NotificationID,
      });
    });
  });
});
