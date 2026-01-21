/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
// Unbound methods are allowed as that's how vi.mocked works

import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { NotificationAdapterOneSignal, NotificationAdapterVoid, NotificationService } from '@common/services';
import { Configuration } from '@common/services/configuration';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

describe('NotificationService', () => {
  // Observability mocks
  const loggerMock = vi.mocked(new Logger());
  const tracerMock = vi.mocked(new Tracer());
  const metricsMock = vi.mocked(new Metrics());

  // Config shims
  const getParameter = vi.fn();
  const getEnumParameter = vi.fn();
  const mockConfigurationService = { getParameter, getEnumParameter } as unknown as Configuration;

  const mockRequest = {
    NotificationID: 'test01',
    ExternalUserID: 'damianp_apadmi_dev_build_01',
    NotificationTitle: 'UNS Test 01 - Title',
    NotificationBody: 'UNS Test 01 - Body',
  };

  let instance: NotificationService;
  beforeEach(() => {
    vi.clearAllMocks();
    instance = new NotificationService(loggerMock, metricsMock, tracerMock, mockConfigurationService);
  });

  describe('initialize', () => {
    it('should fetch data from configuration service and initialize relevant adapter (void)', async () => {
      // Arrange
      getEnumParameter.mockResolvedValueOnce('VOID');

      // Act
      await instance.initialize();

      // Assert
      expect(getEnumParameter).toHaveBeenCalledTimes(1);
      expect(instance.adapter instanceof NotificationAdapterVoid).toEqual(true);
      expect(getParameter).toHaveBeenCalledTimes(0); // Void Adapter should make not further param calls
    });

    it('should fetch data from configuration service and initialize relevant adapter (onesignal)', async () => {
      // Arrange
      getEnumParameter.mockResolvedValueOnce('OneSignal');
      getParameter.mockResolvedValueOnce('apikey');
      getParameter.mockResolvedValueOnce('appId');

      // Act
      await instance.initialize();

      // Assert
      expect(getEnumParameter).toHaveBeenCalledTimes(1); //
      expect(instance.adapter instanceof NotificationAdapterOneSignal).toEqual(true);
      expect(getParameter).toHaveBeenCalledTimes(2); // AppID & API Key fetching
    });
  });

  describe('send', () => {
    it('Sends a request to the void when using Void adapter', async () => {
      // Arrange
      getEnumParameter.mockResolvedValueOnce('VOID');

      // Act
      await instance.initialize();
      await instance.send(mockRequest);

      // Assert
      expect(loggerMock.info).toHaveBeenCalledWith(`Dispatching notification`, {
        NotificationID: mockRequest.NotificationID,
      });
      expect(loggerMock.info).toHaveBeenCalledWith(`Sending notification using Void adapter`, {
        NotificationID: mockRequest.NotificationID,
      });
    });

    it('Sends a request to onesignal and parses valid response', async () => {
      // Arrange
      getEnumParameter.mockResolvedValueOnce('OneSignal');
      getParameter.mockResolvedValueOnce('ONESIGNAL_DEV_API_KEY_SUCCESS_SCENARIO_01');
      getParameter.mockResolvedValueOnce('ONESIGNAL_APP_ID');

      // Act
      await instance.initialize();
      await instance.send(mockRequest);

      // Assert
      expect(loggerMock.info).toHaveBeenCalledWith(`Dispatching notification`, {
        NotificationID: mockRequest.NotificationID,
      });
      expect(loggerMock.info).toHaveBeenCalledWith(`Sending notification using OneSignal adapter`, {
        NotificationID: mockRequest.NotificationID,
      });
    });

    it('Sends a request to onesignal and logs errors before throwing an exception', async () => {
      // Arrange
      getEnumParameter.mockResolvedValueOnce('OneSignal');
      getParameter.mockResolvedValueOnce('ONESIGNAL_DEV_API_KEY_ERROR_SCENARIO_01');
      getParameter.mockResolvedValueOnce('ONESIGNAL_APP_ID');

      // Act
      await instance.initialize();
      await expect(instance.send(mockRequest)).rejects.toThrowError('Request failed with status code 400');

      // Assert
      expect(loggerMock.info).toHaveBeenCalledWith(`Dispatching notification`, {
        NotificationID: mockRequest.NotificationID,
      });
      expect(loggerMock.info).toHaveBeenCalledWith(`Sending notification using OneSignal adapter`, {
        NotificationID: mockRequest.NotificationID,
      });
      expect(loggerMock.error).toHaveBeenCalledWith(
        `Failed to dispatch notification using OneSignal adapter`,
        expect.objectContaining({
          NotificationID: mockRequest.NotificationID,
          status: expect.any(Number),
          response: expect.any(Object),
        })
      );
    });
  });
});
