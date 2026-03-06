/* eslint-disable @typescript-eslint/unbound-method */
import { SQSClient } from '@aws-sdk/client-sqs';
import { QueueEvent } from '@common/operations';
import { BoolParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { Processing } from '@project/lambdas/pso/sqs.processing/handler';
import { Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/repositories', { spy: true });
vi.mock('@common/services', { spy: true });

mockClient(SQSClient);

describe('Processing QueueHandler', () => {
  let instance: Processing;
  let handler: ReturnType<typeof Processing.prototype.handler>;

  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Data presets
  const mockContext: Context = {
    functionName: 'processing',
    awsRequestId: '12345',
  } as unknown as Context;

  const mockMessageBody: IMessage = {
    NotificationID: '1234',
    DepartmentID: 'DVLA01',
    UserID: 'UserID',
    NotificationTitle: 'Hey',
    NotificationBody: "You've got a message in the message centre",
    MessageTitle: '',
    MessageBody: '',
  };

  const mockEvent: QueueEvent<IMessage> = {
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

  const mockFailedEvent: QueueEvent<IMessage> = {
    Records: [
      {
        ...mockEvent.Records[0],
        body: {
          NotificationID: 'invalid-id',
          UserID: 'invalid-id',
          DepartmentID: 'invalid-id',
          // Missed out on purpose NotificationTitle, NotificationBody
        },
      },
    ],
  } as unknown as QueueEvent<IMessage>;

  const mockUnidentifiableEvent: QueueEvent<IMessage> = {
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
  } as unknown as QueueEvent<IMessage>;

  beforeEach(async () => {
    // Reset all mocks
    vi.resetAllMocks();
    vi.useRealTimers();
    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    // Mocking successful completion of service functions
    serviceMocks.dispatchQueueServiceMock.publishMessageBatch.mockResolvedValue(undefined);
    serviceMocks.dispatchQueueServiceMock.publishMessage.mockResolvedValue(undefined);
    serviceMocks.inboundDynamoRepositoryMock.updateRecord.mockResolvedValue(undefined);
    serviceMocks.analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);

    await serviceMocks.analyticsQueueServiceMock.initialize();
    instance = new Processing(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      analyticsService: Promise.resolve(serviceMocks.analyticsServiceMock),
      inboundTable: Promise.resolve(serviceMocks.inboundDynamoRepositoryMock),
      dispatchQueue: serviceMocks.dispatchQueueServiceMock.initialize(),
    }));
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('processing');
  });

  it.each([
    [`true`, `false`],
    [`false`, `true`],
  ])(
    'should obey SSM Enabled flags Common: %s Processing: %s',
    async (commonEnabled: string, processingEnabled: string) => {
      // Arrange
      mockParameterStore[BoolParameters.Config.Common.Enabled] = commonEnabled;
      if (processingEnabled == `false`) {
        mockParameterStore[BoolParameters.Config.Processing.Enabled] = processingEnabled;
      }

      // Act & Assert
      await expect(handler(mockEvent, mockContext)).rejects.toThrow(
        new Error(
          `Function disabled due to config/common/enabled or config/processing/enabled SSM param being toggled off`
        )
      );
    }
  );

  it('should publish analytics events', async () => {
    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishMultipleEvents).toHaveBeenNthCalledWith(
      1,
      [
        {
          DepartmentID: mockMessageBody.DepartmentID,
          NotificationID: mockMessageBody.NotificationID,
          UserID: mockMessageBody.UserID,
        },
      ],
      'PROCESSING'
    );
    expect(serviceMocks.analyticsServiceMock.publishMultipleEvents).toHaveBeenNthCalledWith(
      2,
      [
        {
          DepartmentID: mockMessageBody.DepartmentID,
          MessageBody: mockMessageBody.MessageBody,
          MessageTitle: mockMessageBody.MessageTitle,
          NotificationBody: mockMessageBody.NotificationBody,
          NotificationID: mockMessageBody.NotificationID,
          NotificationTitle: mockMessageBody.NotificationTitle,
          UserID: mockMessageBody.UserID,
        },
      ],
      'PROCESSED'
    );
  });

  it('should update data in the inbound message table', async () => {
    // Arrange
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.inboundDynamoRepositoryMock.updateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        DepartmentID: mockMessageBody.DepartmentID,
        NotificationID: mockMessageBody.NotificationID,
        UserID: mockMessageBody.UserID,
        ExternalUserID: mockMessageBody.UserID, // Placeholder 1:1 mapping between UserID & ExternalUserID while UDP is mocked,
        ProcessedDateTime: date.toISOString(),
      })
    );
  });

  it('should trigger analytics for failure events', async () => {
    // Act
    await handler(mockFailedEvent, mockContext);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishMultipleEvents).toHaveBeenNthCalledWith(
      1,
      [
        {
          NotificationID: 'invalid-id',
          UserID: 'invalid-id',
          DepartmentID: 'invalid-id',
        },
      ],
      'PROCESSING'
    );
  });

  it('should log when a message has no NotificationID or DepartmentID', async () => {
    // Act
    await handler(mockUnidentifiableEvent, mockContext);

    // Assert
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith(
      `Supplied message does not contain NotificationID or DepartmentID, rejecting record`,
      {
        errors: '✖ Invalid input: expected string, received undefined\n  → at NotificationID',
        raw: mockUnidentifiableEvent.Records[0].body,
      }
    );
  });
});
