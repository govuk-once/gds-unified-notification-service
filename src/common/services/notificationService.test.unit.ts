/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
// Unbound methods are allowed as that's how vi.mocked works
import { NotificationAdapterOneSignal, NotificationAdapterVoid, NotificationService } from '@common/services';
import { EnumParameters, StringParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });

describe('NotificationService', () => {
  let instance: NotificationService;

  // Initialize the mock service and repository layers
  const observabilityMock = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMock);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

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

    instance = new NotificationService(observabilityMock, serviceMocks.configurationServiceMock);
  });

  describe('initialize', () => {
    it('should fetch data from configuration service and initialize relevant adapter (void)', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'VOID';

      // Act
      await instance.initialize();

      // Assert
      expect(serviceMocks.configurationServiceMock.getEnumParameter).toHaveBeenCalledTimes(1);
      expect(instance.adapter instanceof NotificationAdapterVoid).toEqual(true);
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledTimes(1);
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith(
        EnumParameters.Config.Dispatch.Adapter
      ); // Void Adapter should make not further param calls
    });

    it('should fetch data from configuration service and initialize relevant adapter (onesignal)', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      const expectedParamCalls = [
        EnumParameters.Config.Dispatch.Adapter,
        StringParameters.Dispatch.OneSignal.ApiKey,
        StringParameters.Dispatch.OneSignal.AppId,
      ];

      // Act
      await instance.initialize();

      // Assert
      expect(serviceMocks.configurationServiceMock.getEnumParameter).toHaveBeenCalledTimes(1); //
      expect(instance.adapter instanceof NotificationAdapterOneSignal).toEqual(true);
      for (const param of expectedParamCalls) {
        expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith(param);
      }
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledTimes(expectedParamCalls.length);
    });
  });

  describe('send', () => {
    it('Sends a request to the void when using Void adapter', async () => {
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

    it('Sends a request to onesignal and parses valid response', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      mockParameterStore[StringParameters.Dispatch.OneSignal.ApiKey] = 'ONESIGNAL_DEV_API_KEY_SUCCESS_SCENARIO_01';
      mockParameterStore[StringParameters.Dispatch.OneSignal.AppId] = 'ONESIGNAL_APP_ID';

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

    it('Sends a request to onesignal and logs errors before throwing an exception', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Dispatch.Adapter] = 'OneSignal';
      mockParameterStore[StringParameters.Dispatch.OneSignal.ApiKey] = 'ONESIGNAL_DEV_API_KEY_ERROR_SCENARIO_01';
      mockParameterStore[StringParameters.Dispatch.OneSignal.AppId] = 'ONESIGNAL_APP_ID';

      // Act
      await instance.initialize();
      const result = instance.send(mockRequest);

      // Assert
      await expect(result).rejects.toThrowError('Request failed with status code 400');
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Dispatching notification`, {
        NotificationID: mockRequest.NotificationID,
      });
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(`Sending notification using OneSignal adapter`, {
        NotificationID: mockRequest.NotificationID,
      });
      expect(observabilityMock.logger.error).toHaveBeenCalledWith(
        `Failed to dispatch notification using OneSignal adapter`,
        expect.objectContaining({
          NotificationID: mockRequest.NotificationID,
          axiosError: expect.any(Object),
        })
      );
    });
  });
});
