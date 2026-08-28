import { FullBatchFailureError } from '@aws-lambda-powertools/batch';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { ServiceMisconfigurationError, SimulatedError } from '@common/models';
import { QueueEvent } from '@common/operations/queueOperation';
import { CircuitBreakerOpenError, MetricsLabels, NotificationAdapterResult } from '@common/services';
import { BoolParameters } from '@common/utils';
import { IProcessedMessage } from '@project/lambdas/interfaces';
import { Dispatch } from '@project/lambdas/pso/sqs.dispatch/handler';
import {
  iocSpies,
  mockDefaultConfig,
  mockEventContext,
  mockFailedIProcessedMessage,
  mockIProcessedMessage,
  mockQueueEvent,
  mockQueueMultiEvents,
  mockServicesExpectedBehaviour,
  mockUnidentifiableIMessage,
} from '@test/mocks';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('Dispatch QueueHandler', () => {
  let instance: Dispatch;
  let handler: ReturnType<typeof Dispatch.prototype.handler>;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = iocSpies();

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Test fixtures
  let context: Context;
  let event: QueueEvent<IProcessedMessage>;

  const message = mockIProcessedMessage();
  const failedMessage = mockFailedIProcessedMessage();
  const unidentifiableMessage = mockUnidentifiableIMessage();

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    vi.useRealTimers();

    // Test Fixtures
    context = mockEventContext('dispatch');
    event = mockQueueEvent(message);

    // Mock SSM store and services responses
    const { resetMockParameterStore } = mockServicesExpectedBehaviour(serviceMocks);
    mockParameterStore = resetMockParameterStore;

    // Mocking successful completion of service functions
    serviceMocks.notificationServiceMock.send.mockResolvedValue({
      requestId: '123',
      success: true,
    } as unknown as NotificationAdapterResult);

    instance = new Dispatch(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      analyticsService: Promise.resolve(serviceMocks.analyticsServiceMock),
      notificationsDynamoRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      notificationsService: Promise.resolve(serviceMocks.notificationServiceMock),
      cacheService: Promise.resolve(serviceMocks.cacheServiceMock),
      circuitBreakerService: Promise.resolve(serviceMocks.circuitBreakerServiceMock),
    }));
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('dispatch');
  });

  it('should throw an error when the message title equals "FAIL_AT_DISPATCH".', async () => {
    // Arrange
    const failTriggerEvent = mockQueueEvent({
      ...message,
      NotificationTitle: 'FAIL_AT_DISPATCH',
    });

    // Act
    const result = handler(failTriggerEvent, context);

    // Assert
    await expect(result).rejects.toThrow(new SimulatedError(['Simulating an error!']));
  });

  it.each([
    [`false`, `true`, `Service is disabled due to parameter config/common/enabled being set to false`],
    [`true`, `false`, `Service is disabled due to parameter config/dispatch/enabled being set to false`],
  ])(
    'should obey SSM Enabled flags Common: %s Processing: %s with expect errorMsg: %s',
    async (commonEnabled: string, dispatchEnabled: string, expectErrorMessage: string) => {
      // Arrange
      mockParameterStore[BoolParameters.Config.Common.Enabled] = commonEnabled;
      mockParameterStore[BoolParameters.Config.Dispatch.Enabled] = dispatchEnabled;

      // Act
      const result = handler(event, context);

      // Assert
      await expect(result).rejects.toThrow(new ServiceMisconfigurationError());
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith(expectErrorMessage);
    }
  );

  it('should publish analytics events', async () => {
    // Arrange
    serviceMocks.notificationServiceMock.send.mockResolvedValue({
      requestId: '123',
    } as unknown as NotificationAdapterResult);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: message.DepartmentID,
        NotificationID: message.NotificationID,
        UserID: message.UserID,
        CampaignID: message.CampaignID,
        OrganisationID: message.OrganisationID,
      },
      'DISPATCHING'
    );
  });

  it('should trigger notification service for valid messages', async () => {
    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationServiceMock.send).toHaveBeenCalledWith({
      ExternalUserID: message.ExternalUserID,
      NotificationID: message.NotificationID,
      NotificationTitle: message.NotificationTitle,
      NotificationBody: message.NotificationBody,
    });
  });

  it('should trigger notification service for valid messages - with deeplink when feature flag is on', async () => {
    // Arrange
    mockParameterStore[BoolParameters.Config.FeatureFlags.DeepLinkUrl] = 'true';
    const messageWithDeeplink = { ...message, DeeplinkURL: 'govuk://travel' };
    const event = mockQueueEvent(messageWithDeeplink);
    serviceMocks.notificationServiceMock.send.mockResolvedValue({
      requestId: '123',
      success: true,
    } as unknown as NotificationAdapterResult);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationServiceMock.send).toHaveBeenCalledWith({
      ExternalUserID: message.ExternalUserID,
      NotificationID: message.NotificationID,
      NotificationTitle: message.NotificationTitle,
      NotificationBody: message.NotificationBody,
      DeeplinkURL: 'govuk://travel',
    });
  });

  it('should update data in the notifications message table', async () => {
    // Arrange
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.updateRecord).toHaveBeenCalledWith(
      {
        DepartmentID: message.DepartmentID,
        NotificationID: message.NotificationID,
        UserID: message.UserID,
        CampaignID: message.CampaignID,
        DispatchedDateTime: date.toISOString(),
        OrganisationID: message.OrganisationID,
      },
      { resetExpirationDate: true }
    );
  });

  it('should send a analytics event when a notification is dispatched', async () => {
    // Arrange
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: message.DepartmentID,
        NotificationID: message.NotificationID,
        CampaignID: message.CampaignID,
        UserID: message.UserID,
        OrganisationID: message.OrganisationID,
      },
      'DISPATCHED'
    );
  });

  it('should dispatch multiple messages to the notification service when messages are valid.', async () => {
    // Arrange
    serviceMocks.notificationServiceMock.send
      .mockResolvedValueOnce({
        requestId: '123',
        success: true,
      } as unknown as NotificationAdapterResult)
      .mockResolvedValueOnce({
        requestId: '124',
        success: true,
      } as unknown as NotificationAdapterResult);

    const message_2 = mockIProcessedMessage();
    const event = mockQueueMultiEvents([message, message_2]);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationServiceMock.send).toHaveBeenCalledWith({
      ExternalUserID: message.ExternalUserID,
      NotificationID: message.NotificationID,
      NotificationTitle: message.NotificationTitle,
      NotificationBody: message.NotificationBody,
    });
    expect(serviceMocks.notificationServiceMock.send).toHaveBeenCalledWith({
      ExternalUserID: message_2.ExternalUserID,
      NotificationID: message_2.NotificationID,
      NotificationTitle: message_2.NotificationTitle,
      NotificationBody: message_2.NotificationBody,
    });
  });

  it('should return a list of all failed processes when it partial fails.', async () => {
    // Arrange
    const event = mockQueueMultiEvents([message, failedMessage]);

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result).toEqual({
      batchItemFailures: [
        {
          itemIdentifier: 'mockMessageId_1',
        },
      ],
    });
  });

  it('should add a metric for the number of failed processes for a partial failure.', async () => {
    // Arrange
    const event = mockQueueMultiEvents([message, failedMessage]);

    // Act
    await handler(event, context);

    // Assert
    expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
      MetricsLabels.BATCH_ITEM_FAILURES_DISPATCH,
      MetricUnit.Count,
      1
    );
  });

  it('should return and error and trigger analytics for failure events for invalid messages.', async () => {
    // Arrange
    const event = mockQueueEvent(failedMessage);

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: failedMessage.DepartmentID,
        NotificationID: failedMessage.NotificationID,
        UserID: failedMessage.UserID,
        CampaignID: failedMessage.CampaignID,
        OrganisationID: failedMessage.OrganisationID,
      },
      'DISPATCHING_FAILED',
      [
        `Invalid input: expected string, received undefined → at NotificationTitle.`,
        `Invalid input: expected string, received undefined → at NotificationBody.`,
      ]
    );
  });

  it('should return an error when rate limiting is enforced', async () => {
    // Arrange
    serviceMocks.cacheServiceMock.rateLimit.mockResolvedValueOnce({ capacityRemaining: 0, exceeded: true });

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
  });

  it('should return an error when the notification service fails to send.', async () => {
    // Arrange
    serviceMocks.notificationServiceMock.send.mockRejectedValueOnce(new Error('Notification failed to send.'));

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
  });

  it('should return an error and log when a message has an invalid NotificationID', async () => {
    // Arrange
    const event = mockQueueEvent(unidentifiableMessage as IProcessedMessage);

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(observabilityMocks.logger.error).toHaveBeenCalledWith(
      `Supplied message does not contain required record fields, rejecting record`,
      expect.objectContaining({
        error: expect.stringContaining('NotificationID'),
        raw: unidentifiableMessage,
      })
    );
  });

  describe('circuit breaker integration', () => {
    it('should check the circuit breaker before dispatching', async () => {
      // Act
      await handler(event, context);

      // Assert
      expect(serviceMocks.circuitBreakerServiceMock.checkCircuit).toHaveBeenCalled();
    });

    it('should record success when notification is dispatched successfully', async () => {
      // Act
      await handler(event, context);

      // Assert
      expect(serviceMocks.circuitBreakerServiceMock.recordSuccess).toHaveBeenCalled();
      expect(serviceMocks.circuitBreakerServiceMock.recordFailure).not.toHaveBeenCalled();
    });

    it('should record failure when notification service returns success: false', async () => {
      // Arrange
      serviceMocks.notificationServiceMock.send.mockRejectedValueOnce(new Error('Service unavailable'));

      // Act
      const result = handler(event, context);

      // Assert
      await expect(result).rejects.toThrow(FullBatchFailureError);
      expect(serviceMocks.circuitBreakerServiceMock.recordFailure).toHaveBeenCalled();
      expect(serviceMocks.circuitBreakerServiceMock.recordSuccess).not.toHaveBeenCalled();
    });

    it('should record failure and rethrow when notification service throws', async () => {
      // Arrange
      serviceMocks.notificationServiceMock.send.mockRejectedValue(new Error('Connection timeout'));

      // Act
      const result = handler(event, context);

      // Assert
      await expect(result).rejects.toThrow(FullBatchFailureError);
      expect(serviceMocks.circuitBreakerServiceMock.recordFailure).toHaveBeenCalled();
    });

    it('should throw an error and without recording an additional failure when the circuit is open', async () => {
      // Arrange
      serviceMocks.circuitBreakerServiceMock.checkCircuit.mockRejectedValue(
        new CircuitBreakerOpenError('notification_dispatch')
      );

      // Act
      const result = handler(event, context);

      // Assert
      await expect(result).rejects.toThrow(FullBatchFailureError);
      expect(serviceMocks.notificationServiceMock.send).not.toHaveBeenCalled();
      expect(serviceMocks.circuitBreakerServiceMock.recordFailure).not.toHaveBeenCalled();
    });
  });
});
