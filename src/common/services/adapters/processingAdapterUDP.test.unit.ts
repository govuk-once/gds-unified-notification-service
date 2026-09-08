import { NoLinkingIdFound, ProcessingAdapterError } from '@common/models/Errors';
import { ProcessingAdapterUDP } from '@common/services/adapters';
import { FetchErrorResponse } from '@common/services/FetchService';
import { ProviderDimension } from '@common/services/observabilityService';
import { mockProcessingAdapterRequest } from '@test/mocks';
import { iocSpies, mockServicesExpectedBehaviour } from '@test/mocks/services/mockInstanceFactory.test.util';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });

describe('ProcessingAdapterUDP', () => {
  let instance: ProcessingAdapterUDP;
  const getMock = vi.fn();

  // Initalise mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = iocSpies();

  const request = mockProcessingAdapterRequest();

  beforeEach(async () => {
    vi.resetAllMocks();

    mockServicesExpectedBehaviour(serviceMocks);

    instance = new ProcessingAdapterUDP(
      observabilityMocks,
      serviceMocks.configurationServiceMock,
      serviceMocks.smConfigurationServiceMock
    );
    await instance.initialize();
    instance.client.get = getMock;
    vi.spyOn(observabilityMocks, 'recordHttpErrorResponse');
  });

  describe('send', () => {
    const pushID = 'mockPushID';
    const notificationID = 'mockNotificationID';
    const successfulResponse = {
      status: 200,
      body: {
        data: {
          pushId: pushID,
          consentStatus: 'accepted',
        },
      },
    };

    it('should return the pushID as the externalUserID when the request is successful', async () => {
      // Arrange
      getMock.mockResolvedValueOnce(successfulResponse);

      // Act
      const result = await instance.send(request);

      // Assert
      expect(getMock).toHaveBeenCalledExactlyOnceWith({
        path: '/v1/notifications',
        headers: {
          'requesting-service': 'dvla',
          'requesting-service-user-id': request.userID,
        },
      });
      expect(result).toEqual({ request, externalUserID: pushID });
      expect(observabilityMocks.recordProviderHttpMetric).toHaveBeenCalledWith(ProviderDimension.UDP, 'call');
    });

    it('should prefer notificationId over pushId when both are present in the response', async () => {
      // Arrange
      const responseWithNotificationId = {
        status: 200,
        body: {
          data: {
            pushId: pushID,
            notificationId: notificationID,
            consentStatus: 'accepted',
          },
        },
      };
      getMock.mockResolvedValueOnce(responseWithNotificationId);

      // Act
      const result = await instance.send(request);

      // Assert
      expect(result).toEqual({ request, externalUserID: notificationID });
    });

    it('should throw NoLinkingIdFound when the fetch call fails with a 404', async () => {
      // Arrange
      const fetchError = new FetchErrorResponse({
        path: '/v1/notifications',
        method: 'GET',
        status: 404,
        body: 'User not found',
      });
      getMock.mockRejectedValueOnce(fetchError);

      // Act
      const result = instance.send(request);

      // Assert
      await expect(result).rejects.toThrow(
        new NoLinkingIdFound([`User ${request.userID} does not exist in UDP service`])
      );
    });

    it('should throw ProcessingAdapterError wehn the fetch call fails with a non-404 error', async () => {
      // Arrange
      const fetchError = new FetchErrorResponse({
        path: '/v1/notifications',
        method: 'GET',
        status: 500,
        body: 'Server error',
      });
      getMock.mockRejectedValueOnce(fetchError);

      // Act
      const result = instance.send(request);

      // Assert
      await expect(result).rejects.toThrow(new ProcessingAdapterError([fetchError.message]));
    });

    it('should rethrow a non-api error as is and log it was a non-api error', async () => {
      // Arrange
      const nonApiError = new Error('Some unexpected error');
      getMock.mockRejectedValueOnce(nonApiError);

      // Act
      const result = instance.send(request);

      // Assert
      await expect(result).rejects.toThrow(nonApiError);
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith(`Non-api Error`, { error: nonApiError });
    });

    it('should throw when the response body from the fetch call fails to match the expected schema', async () => {
      // Arrange
      const invalidResponse = {
        status: 200,
        body: {
          data: {
            consentStatus: 'accepted',
            // Missing pushId and notificationId
          },
        },
      };
      getMock.mockResolvedValueOnce(invalidResponse);

      // Act
      const result = instance.send(request);

      // Assert
      await expect(result).rejects.toThrow();
    });
  });
});
