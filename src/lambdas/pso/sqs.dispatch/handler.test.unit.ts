import { FullBatchFailureError } from '@aws-lambda-powertools/batch';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { SQSClient } from '@aws-sdk/client-sqs';
import { CircuitBreakerStateEnum } from '@common/models/CircuitBreakerStateEnum';
import { ServiceMisconfigurationError, SimulatedError } from '@common/models/Errors/InternalServerError';
import { QueueEvent } from '@common/operations';
import { CircuitBreakerOpenError, MetricsLabels } from '@common/services';
import { NotificationAdapterResult } from '@common/services/interfaces';
import { BoolParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { IProcessedMessage } from '@project/lambdas/interfaces/IProcessedMessage';
import { Dispatch } from '@project/lambdas/pso/sqs.dispatch/handler';
import { Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/repositories', { spy: true });
vi.mock('@common/services', { spy: true });

mockClient(SQSClient);

describe('Dispatch QueueHandler', () => {
  let instance: Dispatch;
  let handler: ReturnType<typeof Dispatch.prototype.handler>;

  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Data presets
  const mockContext: Context = {
    functionName: 'dispatch',
    awsRequestId: '12345',
  } as unknown as Context;

  const mockMessageBody_1: IProcessedMessage = {
    NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80f',
    UserID: 'test_id_01',
    ExternalUserID: 'test',
    DepartmentID: 'Dev',
    CampaignID: 'CAM_ID',
    NotificationTitle: 'Boom',
    NotificationBody: 'psst',
  };

  const mockMessageBody_2: IProcessedMessage = {
    NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d2',
    DepartmentID: 'DVLA01',
    UserID: 'UserID_2',
    NotificationTitle: 'Test message - 002',
    NotificationBody: "You've got a message in the message centre - 2",
    MessageTitle: '',
    MessageBody: '',
    ExternalUserID: 'test_2',
  };

  const mockEvent: QueueEvent<IProcessedMessage> = {
    Records: [
      {
        messageId: 'mockMessageId_1',
        receiptHandle: 'mockReceiptHandle',
        attributes: {
          ApproximateReceiveCount: '2',
          SentTimestamp: '202601021513',
          SenderId: 'mockSenderId',
          ApproximateFirstReceiveTimestamp: '202601021513',
        },
        messageAttributes: {},
        md5OfBody: 'mockMd5OfBody',
        md5OfMessageAttributes: 'mockMd5OfMessageAttributes',
        eventSource: 'aws:sqs',
        eventSourceARN: 'mockEventSourceARN',
        awsRegion: 'eu-west2',
        body: mockMessageBody_1,
      },
    ],
  };

  const mockEvents: QueueEvent<IProcessedMessage> = {
    Records: [
      mockEvent.Records[0],
      {
        ...mockEvent.Records[0],
        messageId: 'mockMessageId_2',
        body: mockMessageBody_2,
      },
    ],
  };

  const mockFailedEvent: QueueEvent<IProcessedMessage> = {
    Records: [
      {
        ...mockEvent.Records[0],
        messageId: 'mockMessageId_2',
        body: {
          NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d2',
          UserID: 'invalid-id',
          DepartmentID: 'invalid-id',
          ExternalUserID: 'test',
          CampaignID: 'invalid-id',
          // Missed out on purpose NotificationTitle, NotificationBody
        },
      },
    ],
  } as unknown as QueueEvent<IProcessedMessage>;

  const mockPartialFailedEvent: QueueEvent<IProcessedMessage> = {
    Records: [
      {
        ...mockEvent.Records[0],
        messageId: 'mockMessageId_1',
        body: {
          NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d1',
          UserID: 'invalid-id',
          DepartmentID: 'invalid-id',
          CampaignID: 'invalid-id',
          // Missed out on purpose NotificationTitle, NotificationBody
        },
      },
      {
        ...mockEvent.Records[0],
        messageId: 'mockMessageId_2',
        body: mockMessageBody_2,
      },
    ],
  } as unknown as QueueEvent<IProcessedMessage>;

  const mockUnidentifiableEvent: QueueEvent<IProcessedMessage> = {
    Records: [
      {
        ...mockEvent.Records[0],
        body: {
          // Set DepartmentID to undefined on purpose
          UserID: 'invalid-id',
          ExternalUserID: 'test',
          DepartmentID: undefined,
          NotificationTitle: 'Boom',
          NotificationBody: 'psst',
        },
      },
    ],
  } as unknown as QueueEvent<IProcessedMessage>;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    vi.useRealTimers();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
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
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('dispatch');
  });

  it('should throw an error when the message title equals "FAIL_AT_DISPATCH".', async () => {
    // Arrange
    const mockFailOnTriggerEvent = {
      Records: [{ ...mockEvent.Records[0], body: { ...mockMessageBody_1, NotificationTitle: 'FAIL_AT_DISPATCH' } }],
    };

    // Act
    const result = handler(mockFailOnTriggerEvent, mockContext);

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
      const result = handler(mockEvent, mockContext);

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
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: mockMessageBody_1.DepartmentID,
        NotificationID: mockMessageBody_1.NotificationID,
        UserID: mockMessageBody_1.UserID,
        CampaignID: mockMessageBody_1.CampaignID,
      },
      'DISPATCHING'
    );
  });

  it('should trigger notification service for valid messages', async () => {
    // Arrange
    serviceMocks.notificationServiceMock.send.mockResolvedValue({
      requestId: '123',
      success: true,
    } as unknown as NotificationAdapterResult);

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.notificationServiceMock.send).toHaveBeenCalledWith({
      ExternalUserID: mockMessageBody_1.ExternalUserID,
      NotificationID: mockMessageBody_1.NotificationID,
      NotificationTitle: mockMessageBody_1.NotificationTitle,
      NotificationBody: mockMessageBody_1.NotificationBody,
    });
  });

  it('should update data in the notifications message table', async () => {
    // Arrange
    serviceMocks.notificationServiceMock.send.mockResolvedValue({
      requestId: '123',
      success: true,
    } as unknown as NotificationAdapterResult);
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.updateRecord).toHaveBeenCalledWith(
      {
        DepartmentID: mockMessageBody_1.DepartmentID,
        NotificationID: mockMessageBody_1.NotificationID,
        UserID: mockMessageBody_1.UserID,
        CampaignID: mockMessageBody_1.CampaignID,
        DispatchedDateTime: date.toISOString(),
      },
      { resetExpirationDate: true }
    );
  });

  it('should send a analytics event when a notification is dispatched', async () => {
    // Arrange
    serviceMocks.notificationServiceMock.send.mockResolvedValue({
      requestId: '123',
      success: true,
    } as unknown as NotificationAdapterResult);
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: mockEvent.Records[0].body.DepartmentID,
        NotificationID: mockEvent.Records[0].body.NotificationID,
        CampaignID: mockEvent.Records[0].body.CampaignID,
        UserID: mockEvent.Records[0].body.UserID,
      },
      'DISPATCHED'
    );
  });

  it('should dispatch multiple messages to the notification service when messages are valid.', async () => {
    // Act
    await handler(mockEvents, mockContext);

    // Assert
    expect(serviceMocks.notificationServiceMock.send).toHaveBeenCalledWith({
      ExternalUserID: mockMessageBody_1.ExternalUserID,
      NotificationID: mockMessageBody_1.NotificationID,
      NotificationTitle: mockMessageBody_1.NotificationTitle,
      NotificationBody: mockMessageBody_1.NotificationBody,
    });
    expect(serviceMocks.notificationServiceMock.send).toHaveBeenCalledWith({
      ExternalUserID: mockMessageBody_2.ExternalUserID,
      NotificationID: mockMessageBody_2.NotificationID,
      NotificationTitle: mockMessageBody_2.NotificationTitle,
      NotificationBody: mockMessageBody_2.NotificationBody,
    });
  });

  it('should return a list of all failed processes when it partial fails.', async () => {
    // Act
    const result = await handler(mockPartialFailedEvent, mockContext);

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
    // Act
    await handler(mockPartialFailedEvent, mockContext);

    // Assert
    expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
      MetricsLabels.BATCH_ITEM_FAILURES_DISPATCH,
      MetricUnit.Count,
      1
    );
  });

  it('should return and error and trigger analytics for failure events for invalid messages.', async () => {
    // Act
    const result = handler(mockFailedEvent, mockContext);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: mockFailedEvent.Records[0].body.DepartmentID,
        NotificationID: mockFailedEvent.Records[0].body.NotificationID,
        UserID: mockFailedEvent.Records[0].body.UserID,
        CampaignID: mockFailedEvent.Records[0].body.CampaignID,
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
    serviceMocks.cacheServiceMock.rateLimit.mockResolvedValueOnce({ capacityRemaining: 0, exceeded: true });

    // Act
    const result = handler(mockEvent, mockContext);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
  });

  it('should return an error when the notification service fails to send.', async () => {
    // Arrange
    serviceMocks.notificationServiceMock.send.mockRejectedValueOnce(new Error('Notification failed to send.'));

    // Act
    const result = handler(mockEvent, mockContext);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
  });

  it('should return an error and log when a message has no NotificationID or DepartmentID', async () => {
    // Act
    const result = handler(mockUnidentifiableEvent, mockContext);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(observabilityMocks.logger.error).toHaveBeenCalledWith(
      `Supplied message does not contain NotificationID or DepartmentID, rejecting record`,
      {
        error: '✖ Invalid input: expected string, received undefined\n  → at body.DepartmentID',
        raw: {
          DepartmentID: undefined,
          ExternalUserID: 'test',
          NotificationBody: 'psst',
          NotificationTitle: 'Boom',
          UserID: 'invalid-id',
        },
      }
    );
  });

  describe('circuit breaker integration', () => {
    it('should check the circuit breaker before dispatching', async () => {
      // Arrange
      serviceMocks.notificationServiceMock.send.mockResolvedValue({
        requestId: '123',
        success: true,
      } as unknown as NotificationAdapterResult);

      // Act
      await handler(mockEvent, mockContext);

      // Assert
      expect(serviceMocks.circuitBreakerServiceMock.checkCircuit).toHaveBeenCalled();
    });

    it('should record success when notification is dispatched successfully', async () => {
      // Arrange
      serviceMocks.notificationServiceMock.send.mockResolvedValue({
        requestId: '123',
        success: true,
      } as unknown as NotificationAdapterResult);

      // Act
      await handler(mockEvent, mockContext);

      // Assert
      expect(serviceMocks.circuitBreakerServiceMock.recordSuccess).toHaveBeenCalled();
      expect(serviceMocks.circuitBreakerServiceMock.recordFailure).not.toHaveBeenCalled();
    });

    it('should record failure when notification service returns success: false', async () => {
      // Arrange
      serviceMocks.notificationServiceMock.send.mockRejectedValueOnce(new Error('Service unavailable'));

      // Act
      const result = handler(mockEvent, mockContext);

      // Assert
      await expect(result).rejects.toThrow(FullBatchFailureError);
      expect(serviceMocks.circuitBreakerServiceMock.recordFailure).toHaveBeenCalled();
      expect(serviceMocks.circuitBreakerServiceMock.recordSuccess).not.toHaveBeenCalled();
    });

    it('should record failure and rethrow when notification service throws', async () => {
      // Arrange
      const unexpectedError = new Error('Connection timeout');
      serviceMocks.notificationServiceMock.send.mockRejectedValue(unexpectedError);

      // Act
      const result = handler(mockEvent, mockContext);

      // Assert
      await expect(result).rejects.toThrow(FullBatchFailureError);
      expect(serviceMocks.circuitBreakerServiceMock.recordFailure).toHaveBeenCalled();
    });

    it('should throw an error and without recording an additional failure when the circuit is open', async () => {
      // Arrange
      const circuitOpenError = new CircuitBreakerOpenError('notification_dispatch');
      serviceMocks.circuitBreakerServiceMock.checkCircuit.mockRejectedValue(circuitOpenError);

      // Act
      const result = handler(mockEvent, mockContext);

      // Assert
      await expect(result).rejects.toThrow(FullBatchFailureError);
      expect(serviceMocks.notificationServiceMock.send).not.toHaveBeenCalled();
      expect(serviceMocks.circuitBreakerServiceMock.recordFailure).not.toHaveBeenCalled();
    });
  });
});
