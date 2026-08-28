// Unbound methods are allowed as that's how vi.mocked works
import { BadGatewayError, ChannelsEnum } from '@common/models';
import { NotificationAdapterOneSignal } from '@common/services/adapters/notificationAdapterOneSignal';
import { NotificationAdapterVoid } from '@common/services/adapters/notificationAdapterVoid';
import { NotificationService } from '@common/services/notificationService';
import { BoolParameters, EnumParameters, StringParameters, StringSecret } from '@common/utils';
import {
  iocSpies,
  mockDefaultConfig,
  mockDefaultSecrets,
  mockNotificationAdapterRequest,
  mockServicesExpectedBehaviour,
} from '@test/mocks';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/client-secrets-manager', { spy: true });

vi.mock('@common/services/configurationService', { spy: true });
vi.mock('@common/services/smNamespacedConfigurationService', { spy: true });

describe('NotificationService', async () => {
  let instance: NotificationService;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = await iocSpies();

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();
  let mockSecrets = mockDefaultSecrets();

  // Test Fixtures
  const request = mockNotificationAdapterRequest();

  beforeEach(() => {
    // Reset all mock
    vi.clearAllMocks();

    // Mock SSM store and services responses
    const { resetMockParameterStore, resetMockSecrets } = mockServicesExpectedBehaviour(serviceMocks);
    mockParameterStore = resetMockParameterStore;
    mockSecrets = resetMockSecrets;
  });

  describe('create', () => {
    it('should fetch data from configuration service, initialize void but not onesignal adapter when (void)', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'VOID';

      // Act
      const instance = await NotificationService.create(
        observabilityMocks,
        serviceMocks.configurationServiceMock,
        serviceMocks.smNamespacedConfigurationServiceMock
      );

      // Assert
      expect(serviceMocks.configurationServiceMock.getEnumParameter).toHaveBeenCalledTimes(1);
      expect(instance.adapter instanceof NotificationAdapterVoid).toEqual(true);
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledTimes(1);
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith(
        EnumParameters.Config.Dispatch.Adapter
      ); // Void Adapter should make not further param calls
    });

    it('should fetch data from configuration service and initialize onesignal adapter when (onesignal)', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      const expectedParamCalls = [
        EnumParameters.Config.Dispatch.Adapter,
        StringParameters.Dispatch.OneSignal.AppId,
        StringParameters.Notification.DeeplinkTemplate,
      ];

      // Act
      const instance = await NotificationService.create(
        observabilityMocks,
        serviceMocks.configurationServiceMock,
        serviceMocks.smNamespacedConfigurationServiceMock
      );

      // Assert
      expect(serviceMocks.configurationServiceMock.getEnumParameter).toHaveBeenCalledTimes(1);
      expect(instance.adapter instanceof NotificationAdapterOneSignal).toEqual(true);
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
      const instance = await NotificationService.create(
        observabilityMocks,
        serviceMocks.configurationServiceMock,
        serviceMocks.smNamespacedConfigurationServiceMock
      );

      // Act
      await instance.send(request);

      // Assert
      expect(observabilityMocks.logger.info).toHaveBeenCalledWith(`Dispatching notification`, {
        NotificationID: request.NotificationID,
      });
      expect(observabilityMocks.logger.info).toHaveBeenCalledWith(`Sending notification using Void adapter`, {
        NotificationID: request.NotificationID,
      });
    });

    it('Sends a request to onesignal when adapter is set to onesignal and parses valid response', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      mockParameterStore[StringParameters.Dispatch.OneSignal.AppId] = 'ONESIGNAL_APP_ID';
      mockSecrets[StringSecret.Dispatch.OneSignal.ApiKey] = 'ONESIGNAL_DEV_API_KEY_SUCCESS_SCENARIO_01';
      const instance = await NotificationService.create(
        observabilityMocks,
        serviceMocks.configurationServiceMock,
        serviceMocks.smNamespacedConfigurationServiceMock
      );

      // Act
      await instance.send(request);

      // Assert
      expect(observabilityMocks.logger.info).toHaveBeenCalledWith(`Dispatching notification`, {
        NotificationID: request.NotificationID,
      });
      expect(observabilityMocks.logger.info).toHaveBeenCalledWith(`Sending notification using OneSignal adapter`, {
        NotificationID: request.NotificationID,
      });
    });

    it('Sends a request to onesignal with a deeplink pointing at notification id', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      mockParameterStore[StringParameters.Dispatch.OneSignal.AppId] = 'ONESIGNAL_APP_ID';
      mockSecrets[StringSecret.Dispatch.OneSignal.ApiKey] = 'ONESIGNAL_DEV_API_KEY_SUCCESS_SCENARIO_01';
      const instance = await NotificationService.create(
        observabilityMocks,
        serviceMocks.configurationServiceMock,
        serviceMocks.smNamespacedConfigurationServiceMock
      );

      const postSpy = vi.spyOn((instance.adapter as NotificationAdapterOneSignal).client, 'post');

      // Act
      await instance.send(request);

      // Assert
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ data: { deeplink: 'govuk://notifications?id=test01' } }),
          path: '/notifications?c=push',
        })
      );
    });

    it('Sends a request to onesignal with an explicit deeplink', async () => {
      // Arrange
      mockParameterStore[BoolParameters.Config.FeatureFlags.DeepLinkUrl] = 'true';
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      mockParameterStore[StringParameters.Dispatch.OneSignal.AppId] = 'ONESIGNAL_APP_ID';
      mockSecrets[StringSecret.Dispatch.OneSignal.ApiKey] = 'ONESIGNAL_DEV_API_KEY_SUCCESS_SCENARIO_01';
      const instance = await NotificationService.create(
        observabilityMocks,
        serviceMocks.configurationServiceMock,
        serviceMocks.smNamespacedConfigurationServiceMock
      );

      const postSpy = vi.spyOn((instance.adapter as NotificationAdapterOneSignal).client, 'post');

      // Act
      await instance.send({
        ...request,
        DeeplinkURL: 'govuk://travel?country=spain',
      });

      // Assert
      expect(postSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ data: { deeplink: 'govuk://travel?country=spain' } }),
          path: '/notifications?c=push',
        })
      );
    });

    it('Sends a request to onesignal and logs errors before throwing an exception', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      mockParameterStore[StringParameters.Dispatch.OneSignal.AppId] = 'ONESIGNAL_APP_ID';
      mockSecrets[StringSecret.Dispatch.OneSignal.ApiKey] = 'ONESIGNAL_DEV_API_KEY_ERROR_SCENARIO_01';
      const instance = await NotificationService.create(
        observabilityMocks,
        serviceMocks.configurationServiceMock,
        serviceMocks.smNamespacedConfigurationServiceMock
      );

      // Act
      const result = instance.send(request);

      // Assert
      await expect(result).rejects.toThrow(new BadGatewayError(['API [POST] /notifications?c=push Failed with 400']));
      expect(observabilityMocks.logger.info).toHaveBeenCalledWith(`Dispatching notification`, {
        NotificationID: request.NotificationID,
      });
      expect(observabilityMocks.logger.info).toHaveBeenCalledWith(`Sending notification using OneSignal adapter`, {
        NotificationID: request.NotificationID,
      });
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith(
        `Failed to dispatch notification using OneSignal adapter`,
        {
          NotificationID: request.NotificationID,
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

    it('Uses onesignal adapter but does not sends a request to onesignal when channel is MESSAGE_CENTER_ONLY', async () => {
      // Arrange
      const requestWithChannel = {
        ...request,
        Channel: ChannelsEnum.MESSAGE_CENTRE_ONLY,
      };
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      mockParameterStore[StringParameters.Dispatch.OneSignal.AppId] = 'ONESIGNAL_APP_ID';
      mockSecrets[StringSecret.Dispatch.OneSignal.ApiKey] = 'ONESIGNAL_DEV_API_KEY_ERROR_SCENARIO_01';

      const instance = await NotificationService.create(
        observabilityMocks,
        serviceMocks.configurationServiceMock,
        serviceMocks.smNamespacedConfigurationServiceMock
      );

      const postSpy = vi.spyOn((instance.adapter as NotificationAdapterOneSignal).client, 'post');

      // Act
      const result = await instance.send(requestWithChannel);

      // Assert
      expect(result).toEqual({ notification: requestWithChannel });
      expect(postSpy).not.toHaveBeenCalled();
      expect(observabilityMocks.logger.info).toHaveBeenCalledWith(
        `Notification is MESSAGE_CENTRE_ONLY, skipping request to OneSignal`,
        { NotificationID: requestWithChannel.NotificationID }
      );
    });

    it('Uses onesignal adapter and sends a request to onesignal when channel is PUSH_NOTIFICATION_AND_MESSAGE_CENTRE', async () => {
      // Arrange
      const requestWithChannel = {
        ...request,
        Channel: ChannelsEnum.PUSH_NOTIFICATION_AND_MESSAGE_CENTRE,
      };
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      mockParameterStore[StringParameters.Dispatch.OneSignal.AppId] = 'ONESIGNAL_APP_ID';
      mockSecrets[StringSecret.Dispatch.OneSignal.ApiKey] = 'ONESIGNAL_DEV_API_KEY_SUCCESS_SCENARIO_01';

      const instance = await NotificationService.create(
        observabilityMocks,
        serviceMocks.configurationServiceMock,
        serviceMocks.smNamespacedConfigurationServiceMock
      );

      const postSpy = vi.spyOn((instance.adapter as NotificationAdapterOneSignal).client, 'post');

      // Act
      const result = await instance.send(requestWithChannel);

      // Assert
      expect(result).toEqual({ notification: requestWithChannel, requestId: 'abc-123' });
      expect(postSpy).toHaveBeenCalled();
    });
  });
});
