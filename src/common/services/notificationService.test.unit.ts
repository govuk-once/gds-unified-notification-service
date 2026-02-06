/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
// Unbound methods are allowed as that's how vi.mocked works
import { NotificationAdapterOneSignal, NotificationAdapterVoid, NotificationService } from '@common/services';
import { EnumParameters, StringParameters } from '@common/utils';
import { MockConfigurationImplementation } from '@common/utils/mockConfigurationImplementation.test.unit.utils';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

describe('NotificationService', () => {
  let instance: NotificationService;

  // Observability and Service mocks
  const observabilityMock = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMock);

  // Mocking implementation of the configuration service
  const mockConfigurationImplementation: MockConfigurationImplementation = new MockConfigurationImplementation();

  const mockRequest = {
    NotificationID: 'test01',
    ExternalUserID: 'sample_external_user_id',
    NotificationTitle: 'UNS Test 01 - Title',
    NotificationBody: 'UNS Test 01 - Body',
  };

  beforeEach(() => {
    // Reset all mock
    vi.clearAllMocks();
    mockConfigurationImplementation.resetConfig();

    serviceMocks.configurationServiceMock.getParameter = vi.fn().mockImplementation((namespace: string) => {
      return Promise.resolve(mockConfigurationImplementation.stringConfiguration[namespace]);
    });
    serviceMocks.configurationServiceMock.getEnumParameter = vi.fn().mockImplementation((namespace: string) => {
      return Promise.resolve(mockConfigurationImplementation.enumConfiguration[namespace]);
    });

    instance = new NotificationService(observabilityMock, serviceMocks.configurationServiceMock);
  });

  describe('initialize', () => {
    it('should fetch data from configuration service and initialize relevant adapter (void)', async () => {
      // Arrange
      mockConfigurationImplementation.setEnumConfig({
        [EnumParameters.Config.Dispatch.Adapter]: 'VOID',
      });

      // Act
      await instance.initialize();

      // Assert
      expect(serviceMocks.configurationServiceMock.getEnumParameter).toHaveBeenCalledTimes(1);
      expect(instance.adapter instanceof NotificationAdapterVoid).toEqual(true);
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledTimes(0); // Void Adapter should make not further param calls
    });

    it('should fetch data from configuration service and initialize relevant adapter (onesignal)', async () => {
      // Act
      await instance.initialize();

      // Assert
      expect(serviceMocks.configurationServiceMock.getEnumParameter).toHaveBeenCalledTimes(1); //
      expect(instance.adapter instanceof NotificationAdapterOneSignal).toEqual(true);
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledTimes(2); // AppID & API Key fetching
    });
  });

  describe('send', () => {
    it('Sends a request to the void when using Void adapter', async () => {
      // Arrange
      mockConfigurationImplementation.setEnumConfig({
        [EnumParameters.Config.Dispatch.Adapter]: 'VOID',
      });

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
      mockConfigurationImplementation.setStringConfig({
        [StringParameters.Dispatch.OneSignal.ApiKey]: 'ONESIGNAL_DEV_API_KEY_SUCCESS_SCENARIO_01',
      });
      mockConfigurationImplementation.setStringConfig({
        [StringParameters.Dispatch.OneSignal.AppId]: 'ONESIGNAL_APP_ID',
      });

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
      mockConfigurationImplementation.setStringConfig({
        [StringParameters.Dispatch.OneSignal.ApiKey]: 'ONESIGNAL_DEV_API_KEY_ERROR_SCENARIO_01',
      });
      mockConfigurationImplementation.setStringConfig({
        [StringParameters.Dispatch.OneSignal.AppId]: 'ONESIGNAL_APP_ID',
      });

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
