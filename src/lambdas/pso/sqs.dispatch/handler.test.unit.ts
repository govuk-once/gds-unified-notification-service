import { FullBatchFailureError } from '@aws-lambda-powertools/batch';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { CircuitBreakerStateEnum } from '@common/models/CircuitBreakerStateEnum';
import { ServiceMisconfigurationError, SimulatedError } from '@common/models/Errors/InternalServerError';
import { CircuitBreakerOpenError, MetricsLabels } from '@common/services';
import { NotificationAdapterResult } from '@common/services/interfaces';
import { BoolParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockDefaultSecrets,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { mockEventContext, mockQueueEvent, mockQueueMultiEvents } from '@common/utils/mockEvents.test.utils';
import { awsClientSpies, observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import {
  IProcessedMessage,
  mockFailedIProcessedMessage,
  mockIProcessedMessage,
  mockUnidentifiableIMessage,
} from '@project/lambdas/interfaces';
import { Dispatch } from '@project/lambdas/pso/sqs.dispatch/handler';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/repositories', { spy: true });
vi.mock('@common/services', { spy: true });

describe('Dispatch QueueHandler', () => {
  let instance: Dispatch;
  let handler: ReturnType<typeof Dispatch.prototype.handler>;

  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const awsClientMocks = awsClientSpies();
  const serviceMocks = ServiceSpies(observabilityMocks, awsClientMocks);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();
  let mockSecrets = mockDefaultSecrets();

  // Test fixtures
  const context = mockEventContext('dispatch');
  const messageBody = mockIProcessedMessage();
  const failedMessageBody = mockFailedIProcessedMessage();
  const unidentifiableMessageBody = mockUnidentifiableIMessage();

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    vi.useRealTimers();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    mockSecrets = mockDefaultSecrets();
    serviceMocks.smNamespacedConfigurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockSecrets)
    );

    // Mocking successful completion of service functions
    serviceMocks.notificationsDynamoRepositoryMock.updateRecord.mockResolvedValue(undefined);
    serviceMocks.analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
    serviceMocks.analyticsServiceMock.publishEvent.mockResolvedValue(undefined);

    await serviceMocks.analyticsQueueServiceMock.initialize();
    await serviceMocks.notificationServiceMock.initialize();

    serviceMocks.cacheServiceMock.rateLimit.mockResolvedValue({ exceeded: false, capacityRemaining: 10 });
    serviceMocks.circuitBreakerServiceMock.checkCircuit.mockResolvedValue(undefined);
    serviceMocks.circuitBreakerServiceMock.recordSuccess.mockResolvedValue(undefined);
    serviceMocks.circuitBreakerServiceMock.recordFailure.mockResolvedValue(undefined);
    serviceMocks.circuitBreakerServiceMock.getState.mockResolvedValue(CircuitBreakerStateEnum.CLOSED);
    instance = new Dispatch(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      analyticsService: Promise.resolve(serviceMocks.analyticsServiceMock),
      notificationsDynamoRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
      notificationsService: Promise.resolve(serviceMocks.notificationServiceMock),
      cacheService: Promise.resolve(serviceMocks.cacheServiceMock),
      circuitBreakerService: Promise.resolve(serviceMocks.circuitBreakerServiceMock),
    }));

    serviceMocks.notificationServiceMock.send.mockResolvedValue({
      requestId: '123',
      success: true,
    } as unknown as NotificationAdapterResult);

    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('dispatch');
  });

  it('should throw an error when the message title equals "FAIL_AT_DISPATCH".', async () => {
    // Arrange
    const messageBodyWithFailTrigger = {
      ...messageBody,
      NotificationTitle: 'FAIL_AT_DISPATCH',
    };
    const event = mockQueueEvent(messageBodyWithFailTrigger);

    // Act
    const result = handler(event, context);

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
      const event = mockQueueEvent(messageBody);
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
    const event = mockQueueEvent(messageBody);
    serviceMocks.notificationServiceMock.send.mockResolvedValue({
      requestId: '123',
    } as unknown as NotificationAdapterResult);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: messageBody.DepartmentID,
        NotificationID: messageBody.NotificationID,
        UserID: messageBody.UserID,
        CampaignID: messageBody.CampaignID,
        OrganisationID: messageBody.OrganisationID,
      },
      'DISPATCHING'
    );
  });

  it('should trigger notification service for valid messages', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);
    serviceMocks.notificationServiceMock.send.mockResolvedValue({
      requestId: '123',
      success: true,
    } as unknown as NotificationAdapterResult);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationServiceMock.send).toHaveBeenCalledWith({
      ExternalUserID: messageBody.ExternalUserID,
      NotificationID: messageBody.NotificationID,
      NotificationTitle: messageBody.NotificationTitle,
      NotificationBody: messageBody.NotificationBody,
    });
  });

  it('should update data in the notifications message table', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.updateRecord).toHaveBeenCalledWith(
      {
        DepartmentID: messageBody.DepartmentID,
        NotificationID: messageBody.NotificationID,
        UserID: messageBody.UserID,
        CampaignID: messageBody.CampaignID,
        DispatchedDateTime: date.toISOString(),
        OrganisationID: messageBody.OrganisationID,
      },
      { resetExpirationDate: true }
    );
  });

  it('should send a analytics event when a notification is dispatched', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: event.Records[0].body.DepartmentID,
        NotificationID: event.Records[0].body.NotificationID,
        CampaignID: event.Records[0].body.CampaignID,
        UserID: event.Records[0].body.UserID,
        OrganisationID: event.Records[0].body.OrganisationID,
      },
      'DISPATCHED'
    );
  });

  it('should dispatch multiple messages to the notification service when messages are valid.', async () => {
    // Arrange
    const messageBody_2 = mockIProcessedMessage();
    const event = mockQueueMultiEvents([messageBody, messageBody_2]);

    // Act
    await handler(event, context);

    // Assert
    expect(serviceMocks.notificationServiceMock.send).toHaveBeenCalledWith({
      ExternalUserID: messageBody.ExternalUserID,
      NotificationID: messageBody.NotificationID,
      NotificationTitle: messageBody.NotificationTitle,
      NotificationBody: messageBody.NotificationBody,
    });
    expect(serviceMocks.notificationServiceMock.send).toHaveBeenCalledWith({
      ExternalUserID: messageBody_2.ExternalUserID,
      NotificationID: messageBody_2.NotificationID,
      NotificationTitle: messageBody_2.NotificationTitle,
      NotificationBody: messageBody_2.NotificationBody,
    });
  });

  it('should return a list of all failed processes when it partial fails.', async () => {
    // Arrange
    const event = mockQueueMultiEvents([messageBody, failedMessageBody]);

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
    const event = mockQueueMultiEvents([messageBody, failedMessageBody]);

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
    const event = mockQueueEvent(failedMessageBody);

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: failedMessageBody.DepartmentID,
        NotificationID: failedMessageBody.NotificationID,
        UserID: failedMessageBody.UserID,
        CampaignID: failedMessageBody.CampaignID,
        OrganisationID: failedMessageBody.OrganisationID,
      },
      'DISPATCHING_FAILED',
      [
        `Invalid input: expected string, received undefined → at body.NotificationTitle.`,
        `Invalid input: expected string, received undefined → at body.NotificationBody.`,
      ]
    );
  });

  it('should return an error when rate limiting is enforced', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);
    serviceMocks.cacheServiceMock.rateLimit.mockResolvedValueOnce({ capacityRemaining: 0, exceeded: true });

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
  });

  it('should return an error when the notification service fails to send.', async () => {
    // Arrange
    const event = mockQueueEvent(messageBody);
    serviceMocks.notificationServiceMock.send.mockRejectedValueOnce(new Error('Notification failed to send.'));

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
  });

  it('should return an error and log when a message has an invalid NotificationID', async () => {
    // Arrange
    const event = mockQueueEvent(unidentifiableMessageBody as IProcessedMessage);

    // Act
    const result = handler(event, context);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(observabilityMocks.logger.error).toHaveBeenCalledWith(
      `Supplied message does not contain required record fields, rejecting record`,
      expect.objectContaining({
        error: expect.stringContaining('body.NotificationID'),
        raw: unidentifiableMessageBody,
      })
    );
  });

  describe('circuit breaker integration', () => {
    it('should check the circuit breaker before dispatching', async () => {
      // Arrange
      const event = mockQueueEvent(messageBody);

      // Act
      await handler(event, context);

      // Assert
      expect(serviceMocks.circuitBreakerServiceMock.checkCircuit).toHaveBeenCalled();
    });

    it('should record success when notification is dispatched successfully', async () => {
      // Arrange
      const event = mockQueueEvent(messageBody);

      // Act
      await handler(event, context);

      // Assert
      expect(serviceMocks.circuitBreakerServiceMock.recordSuccess).toHaveBeenCalled();
      expect(serviceMocks.circuitBreakerServiceMock.recordFailure).not.toHaveBeenCalled();
    });

    it('should record failure when notification service returns success: false', async () => {
      // Arrange
      serviceMocks.notificationServiceMock.send.mockRejectedValueOnce(new Error('Service unavailable'));
      const event = mockQueueEvent(messageBody);

      // Act
      const result = handler(event, context);

      // Assert
      await expect(result).rejects.toThrow(FullBatchFailureError);
      expect(serviceMocks.circuitBreakerServiceMock.recordFailure).toHaveBeenCalled();
      expect(serviceMocks.circuitBreakerServiceMock.recordSuccess).not.toHaveBeenCalled();
    });

    it('should record failure and rethrow when notification service throws', async () => {
      // Arrange
      const unexpectedError = new Error('Connection timeout');
      serviceMocks.notificationServiceMock.send.mockRejectedValue(unexpectedError);
      const event = mockQueueEvent(messageBody);

      // Act
      const result = handler(event, context);

      // Assert
      await expect(result).rejects.toThrow(FullBatchFailureError);
      expect(serviceMocks.circuitBreakerServiceMock.recordFailure).toHaveBeenCalled();
    });

    it('should throw an error and without recording an additional failure when the circuit is open', async () => {
      // Arrange
      const circuitOpenError = new CircuitBreakerOpenError('notification_dispatch');
      serviceMocks.circuitBreakerServiceMock.checkCircuit.mockRejectedValue(circuitOpenError);
      const event = mockQueueEvent(messageBody);

      // Act
      const result = handler(event, context);

      // Assert
      await expect(result).rejects.toThrow(FullBatchFailureError);
      expect(serviceMocks.notificationServiceMock.send).not.toHaveBeenCalled();
      expect(serviceMocks.circuitBreakerServiceMock.recordFailure).not.toHaveBeenCalled();
    });
  });
});
