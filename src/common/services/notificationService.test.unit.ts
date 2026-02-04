/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
// Unbound methods are allowed as that's how vi.mocked works
import { NotificationAdapterOneSignal, NotificationAdapterVoid, NotificationService } from '@common/services';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

describe('NotificationService', () => {
  // Observability and Service mocks
  const observabilityMock = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMock);
  serviceMocks.configurationServiceMock.getEnumParameter = vi.fn().mockResolvedValue('OneSignal');
  serviceMocks.configurationServiceMock.getParameter = vi.fn();

  const mockRequest = {
    NotificationID: 'test01',
    ExternalUserID: 'sample_external_user_id',
    NotificationTitle: 'UNS Test 01 - Title',
    NotificationBody: 'UNS Test 01 - Body',
  };

  let instance: NotificationService;
  beforeEach(() => {
    vi.clearAllMocks();
    instance = new NotificationService(observabilityMock, serviceMocks.configurationServiceMock);
  });

  describe('initialize', () => {
    it('should fetch data from configuration service and initialize relevant adapter (void)', async () => {
      // Arrange
      serviceMocks.configurationServiceMock.getEnumParameter.mockResolvedValueOnce('VOID');

      // Act
      await instance.initialize();

      // Assert
      expect(serviceMocks.configurationServiceMock.getEnumParameter).toHaveBeenCalledTimes(1);
      expect(instance.adapter instanceof NotificationAdapterVoid).toEqual(true);
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledTimes(0); // Void Adapter should make not further param calls
    });

    it('should fetch data from configuration service and initialize relevant adapter (onesignal)', async () => {
      // Arrange
      serviceMocks.configurationServiceMock.getEnumParameter.mockResolvedValueOnce('OneSignal');
      serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce('apikey');
      serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce('appId');

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
      serviceMocks.configurationServiceMock.getEnumParameter.mockResolvedValueOnce('VOID');

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
      serviceMocks.configurationServiceMock.getEnumParameter.mockResolvedValueOnce('OneSignal');
      serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(
        'ONESIGNAL_DEV_API_KEY_SUCCESS_SCENARIO_01'
      );
      serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce('ONESIGNAL_APP_ID');

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
      serviceMocks.configurationServiceMock.getEnumParameter.mockResolvedValueOnce('OneSignal');
      serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(
        'ONESIGNAL_DEV_API_KEY_ERROR_SCENARIO_01'
      );
      serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce('ONESIGNAL_APP_ID');

      // Act
      await instance.initialize();
      await expect(instance.send(mockRequest)).rejects.toThrowError('Request failed with status code 400');

      // Assert
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
