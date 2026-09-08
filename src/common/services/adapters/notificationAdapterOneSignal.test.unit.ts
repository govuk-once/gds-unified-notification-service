import { ProviderDimension } from '@common/index';
import { DispatchAdapterError, NoDispatchIdFound } from '@common/models';
import { ChannelsEnum } from '@common/models/ChannelsEnum';
import { FetchErrorResponse } from '@common/services/FetchService';
import { iocSpies, mockNotificationAdapterRequest, mockServicesExpectedBehaviour } from '@test/mocks';
import { NotificationAdapterOneSignal } from './notificationAdapterOneSignal';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@common/services', { spy: true });

describe('NotificationAdapterOneSignal', () => {
  let instance: NotificationAdapterOneSignal;
  const { observabilityMocks, serviceMocks } = iocSpies();
  const request = mockNotificationAdapterRequest();
  const postMock = vi.fn();
  const responseBody = {
    status: 200,
    body: {
      errors: [],
      id: 'test-response-id',
    },
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    mockServicesExpectedBehaviour(serviceMocks);
    instance = new NotificationAdapterOneSignal(
      observabilityMocks,
      serviceMocks.configurationServiceMock,
      serviceMocks.smNamespacedConfigurationServiceMock
    );
    await instance.initialize();
    instance.client.post = postMock;
    vi.spyOn(observabilityMocks, 'recordProviderHttpMetric');
  });
  describe('send', () => {
    it('should not call OneSignal API and return the unmodified request for a MESSAGE_CENTRE_ONLY channel', async () => {
      // Arrange
      const req = { ...request, Channel: ChannelsEnum.MESSAGE_CENTRE_ONLY };
      // Act
      const result = await instance.send(req);
      // Assert
      expect(result.notification).toEqual(req);
      expect(observabilityMocks.logger.info).toHaveBeenCalledWith(
        `Notification is MESSAGE_CENTRE_ONLY, skipping request to OneSignal`,
        { NotificationID: req.NotificationID }
      );
    });

    it('should send a notification and return a requestId on successful response', async () => {
      // Arrange
      postMock.mockResolvedValue(responseBody);
      // Act
      const result = await instance.send(request);
      // Assert
      expect(result.notification).toEqual(request);
      expect(result.requestId).toEqual('test-response-id');
      expect(postMock).toHaveBeenCalledExactlyOnceWith({
        path: `/notifications?c=push`,
        body: {
          app_id: 'mockOneSignalAppId',
          contents: { en: request.NotificationBody },
          headings: { en: request.NotificationTitle },
          idempotency_key: request.NotificationID,
          target_channel: 'push',
          include_aliases: { external_id: [request.ExternalUserID] },
          data: {
            deeplink: 'govuk://notifications?id=test01',
          },
        },
      });
      expect(result).toEqual({ notification: request, requestId: 'test-response-id' });
      expect(observabilityMocks.recordProviderHttpMetric).toHaveBeenCalledWith(ProviderDimension.ONESIGNAL, 'call');
    });

    it('should build the deeplink from the template using the notificationID when no DeeplinkURL is provided', async () => {
      // Arrange
      postMock.mockResolvedValue(responseBody);
      // Act
      await instance.send(request);
      // Assert
      expect(postMock).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          body: expect.objectContaining({
            data: expect.objectContaining({
              deeplink: 'govuk://notifications?id=test01',
            }),
          }),
        })
      );
    });

    it('should use the provided DeeplinkURL when it is provided', async () => {
      // Arrange
      const req = { ...request, DeeplinkURL: 'https://example.com' };
      postMock.mockResolvedValue(responseBody);
      // Act
      await instance.send(req);
      // Assert
      expect(postMock).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          body: expect.objectContaining({
            data: expect.objectContaining({
              deeplink: 'https://example.com',
            }),
          }),
        })
      );
    });

    it('should append the notificationID query parameter when the DeeplinkURL starts with govuk://', async () => {
      // Arrange
      const req = { ...request, DeeplinkURL: 'govuk://example.com' };
      postMock.mockResolvedValue(responseBody);
      // Act
      await instance.send(req);
      // Assert
      expect(postMock).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          body: expect.objectContaining({
            data: expect.objectContaining({
              deeplink: 'govuk://example.com?notificationID=test01',
            }),
          }),
        })
      );
    });

    it('should throw NoDispatchIdFound when the response resolves with a 404 status and errors in the body', async () => {
      // Arrange
      const badResponse = {
        status: 404,
        body: {
          errors: ['not found'],
        },
      };
      postMock.mockResolvedValueOnce(badResponse);

      // Act
      const result = instance.send(request);

      // Arrange
      await expect(result).rejects.toThrow(
        new NoDispatchIdFound([`User ${request.ExternalUserID} does not exist in OneSignal service`])
      );
    });

    it('should throw DispatchAdapterError when the response resolves with a non-404 status and errors in the body', async () => {
      // Arrange
      const badResponse = {
        status: 401,
        body: {
          errors: ['not found'],
        },
      };
      postMock.mockResolvedValueOnce(badResponse);

      // Act
      const result = instance.send(request);

      // Assert
      await expect(result).rejects.toThrow(new DispatchAdapterError(['not found']));
    });

    it('should throw DispatchAdapterError when the response id is empty with no explicit errors', async () => {
      // Arrange
      const badResponse = {
        status: 401,
        body: {
          id: '',
          errors: undefined,
        },
      };
      postMock.mockResolvedValueOnce(badResponse);

      // Act
      const result = instance.send(request);

      // Assert
      await expect(result).rejects.toThrow(
        new DispatchAdapterError(['Failed to dispatch notification using OneSignal adapter - received 200 code'])
      );
    });

    it('should throw NoDispatchIdFound when the fetch call responds with a 404', async () => {
      // Arrange
      const fetchError = new FetchErrorResponse({ path: '/notification', method: 'POST', status: 404 });
      postMock.mockRejectedValueOnce(fetchError);

      // Act
      const result = instance.send(request);

      // Assert
      await expect(result).rejects.toThrow(
        new NoDispatchIdFound([`User ${request.ExternalUserID} not found in OneSignal`])
      );
    });

    it('should throw DispatchAdapterError when the underlying fetch call fails with a non-404 error', async () => {
      // Arrange
      const fetchError = new FetchErrorResponse({ path: '/notification', method: 'POST', status: 500 });
      postMock.mockRejectedValueOnce(fetchError);

      // Act
      const result = instance.send(request);

      // Assert
      await expect(result).rejects.toThrow(new DispatchAdapterError([fetchError.message]));
    });
  });
});
