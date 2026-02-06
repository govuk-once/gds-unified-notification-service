/* eslint-disable @typescript-eslint/unbound-method */
import { SQSClient } from '@aws-sdk/client-sqs';
import { QueueEvent } from '@common/operations';
import { NotificationAdapterResult } from '@common/services/interfaces';
import { BoolParameters } from '@common/utils';
import { MockConfigurationImplementation } from '@common/utils/mockConfigurationImplementation.test.unit.utils';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { IProcessedMessage } from '@project/lambdas/interfaces/IProcessedMessage';
import { Dispatch } from '@project/lambdas/trigger/dispatch/handler';
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

  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  // Mocking implementation of the configuration service
  const mockConfigurationImplementation: MockConfigurationImplementation = new MockConfigurationImplementation();

  // Data presets
  const mockContext: Context = {
    functionName: 'dispatch',
    awsRequestId: '12345',
  } as unknown as Context;

  const mockMessageBody: IProcessedMessage = {
    NotificationID: '7351e7c8-7314-4d2b-a590-4f053c6ef80f',
    UserID: 'test_id_01',
    ExternalUserID: 'test',
    DepartmentID: 'Dev',
    NotificationTitle: 'Boom',
    NotificationBody: 'psst',
  };

  const mockEvent: QueueEvent<IProcessedMessage> = {
    Records: [
      {
        messageId: 'mockMessageId',
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
        body: mockMessageBody,
      },
    ],
  };

  const mockFailedEvent: QueueEvent<IProcessedMessage> = {
    Records: [
      {
        ...mockEvent.Records[0],
        body: {
          NotificationID: 'invalid-id',
          UserID: 'invalid-id',
          DepartmentID: 'invalid-id',
          ExternalUserID: 'test',
          // Missed out on purpose NotificationTitle, NotificationBody
        },
      },
    ],
  } as unknown as QueueEvent<IProcessedMessage>;

  const mockUnidentifiableEvent: QueueEvent<IProcessedMessage> = {
    Records: [
      {
        ...mockEvent.Records[0],
        body: {
          // Set NotificationID to undefined on purpose
          NotificationID: undefined,
          UserID: 'invalid-id',
          ExternalUserID: 'test',
          DepartmentID: 'invalid-id',
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
    mockConfigurationImplementation.resetConfig();

    // Mocking successful completion of service functions
    serviceMocks.inboundDynamoRepositoryMock.updateRecord.mockResolvedValue(undefined);
    serviceMocks.analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
    serviceMocks.analyticsServiceMock.publishEvent.mockResolvedValue(undefined);

    serviceMocks.configurationServiceMock.getParameter.mockImplementation((namespace: string) => {
      return Promise.resolve(mockConfigurationImplementation.stringConfiguration[namespace]);
    });
    serviceMocks.configurationServiceMock.getBooleanParameter.mockImplementation((namespace: string) => {
      return Promise.resolve(mockConfigurationImplementation.booleanConfiguration[namespace]);
    });
    serviceMocks.configurationServiceMock.getEnumParameter.mockImplementation((namespace: string) => {
      return Promise.resolve(mockConfigurationImplementation.enumConfiguration[namespace]);
    });
    serviceMocks.configurationServiceMock.getNumericParameter.mockImplementation((namespace: string) => {
      return Promise.resolve(mockConfigurationImplementation.numericConfiguration[namespace]);
    });

    await serviceMocks.analyticsQueueServiceMock.initialize();
    await serviceMocks.notificationServiceMock.initialize();

    serviceMocks.cacheServiceMock.rateLimit.mockResolvedValue({ exceeded: false, capacityRemaining: 10 });
    instance = new Dispatch(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      analyticsService: Promise.resolve(serviceMocks.analyticsServiceMock),
      inboundDynamodbRepository: Promise.resolve(serviceMocks.inboundDynamoRepositoryMock),
      notificationsService: Promise.resolve(serviceMocks.notificationServiceMock),
      cacheService: Promise.resolve(serviceMocks.cacheServiceMock),
    }));
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('dispatch');
  });

  it.each([
    [`enabled`, `disabled`],
    [`disabled`, `enabled`],
  ])(
    'should obey SSM Enabled flags Common: %s Dispatch: %s',
    async (commonEnabled: string, dispatchEnabled: string) => {
      // Arrange
      mockConfigurationImplementation.setBooleanConfig({
        [BoolParameters.Config.Common.Enabled]: commonEnabled == `enabled`,
      });
      if (dispatchEnabled == `disabled`) {
        mockConfigurationImplementation.setBooleanConfig({
          [BoolParameters.Config.Dispatch.Enabled]: (dispatchEnabled as string) == `enabled`,
        });
      }

      // Act
      const result = instance.implementation(mockEvent, mockContext);

      // Assert
      await expect(result).rejects.toThrow(
        new Error(
          `Function disabled due to config/common/enabled or config/dispatch/enabled SSM param being toggled off`
        )
      );
    }
  );

  it('should publish analytics events', async () => {
    // Arrange
    serviceMocks.notificationServiceMock.send.mockResolvedValue({
      requestId: '123',
      success: true,
    } as unknown as NotificationAdapterResult);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishMultipleEvents).toHaveBeenCalledWith(
      [
        {
          DepartmentID: mockMessageBody.DepartmentID,
          NotificationID: mockMessageBody.NotificationID,
          UserID: mockMessageBody.UserID,
        },
      ],
      'DISPATCHING'
    );
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: mockMessageBody.DepartmentID,
        NotificationID: mockMessageBody.NotificationID,
        UserID: mockMessageBody.UserID,
      },
      'DISPATCHED'
    );
  });

  it('should trigger notification service for valid messages', async () => {
    // Arrange
    serviceMocks.notificationServiceMock.send.mockResolvedValue({
      requestId: '123',
      success: true,
    } as unknown as NotificationAdapterResult);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.notificationServiceMock.send).toHaveBeenCalledWith({
      ExternalUserID: mockMessageBody.ExternalUserID,
      NotificationID: mockMessageBody.NotificationID,
      NotificationTitle: mockMessageBody.NotificationTitle,
      NotificationBody: mockMessageBody.NotificationBody,
    });
  });

  it('should update data in the inbound message table', async () => {
    // Arrange
    serviceMocks.notificationServiceMock.send.mockResolvedValue({
      requestId: '123',
      success: true,
    } as unknown as NotificationAdapterResult);
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.inboundDynamoRepositoryMock.updateRecord).toHaveBeenCalledWith({
      DepartmentID: mockMessageBody.DepartmentID,
      NotificationID: mockMessageBody.NotificationID,
      UserID: mockMessageBody.UserID,
      DispatchedStartDateTime: date.toISOString(),
    });
  });

  it('should trigger analytics for failure events when NotificationService fails.', async () => {
    // Arrange
    serviceMocks.notificationServiceMock.send.mockResolvedValue({
      success: false,
      errors: ['Service unavailable'],
    } as unknown as NotificationAdapterResult);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: mockMessageBody.DepartmentID,
        NotificationID: mockMessageBody.NotificationID,
        UserID: mockMessageBody.UserID,
      },
      'DISPATCHING_FAILED'
    );
  });

  it('should trigger analytics for failure events for invalid messages.', async () => {
    // Act
    await instance.implementation(mockFailedEvent, mockContext);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: mockFailedEvent.Records[0].body.DepartmentID,
        NotificationID: mockFailedEvent.Records[0].body.NotificationID,
      },
      'DISPATCHING_FAILED',
      '✖ Invalid input: expected string, received undefined\n  → at NotificationTitle\n✖ Invalid input: expected string, received undefined\n  → at NotificationBody'
    );
  });

  it('should log when a message has no NotificationID or DepartmentID', async () => {
    // Act
    await instance.implementation(mockUnidentifiableEvent, mockContext);

    // Assert
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith(
      `Supplied message does not contain NotificationID or DepartmentID, rejecting record`,
      {
        errors: '✖ Invalid input: expected string, received undefined\n  → at NotificationID',
        raw: {
          DepartmentID: 'invalid-id',
          ExternalUserID: 'test',
          NotificationBody: 'psst',
          NotificationID: undefined,
          NotificationTitle: 'Boom',
          UserID: 'invalid-id',
        },
      }
    );
  });
});
