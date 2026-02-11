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
import { Validation } from '@project/lambdas/trigger/validation/handler';
import { Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/repositories', { spy: true });
vi.mock('@common/services', { spy: true });

mockClient(SQSClient);

describe('Validation QueueHandler', () => {
  let instance: Validation;
  let handler: ReturnType<typeof Validation.prototype.handler>;

  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Data presents
  const mockContext: Context = {
    functionName: 'validation',
    awsRequestId: '12345',
  } as unknown as Context;

  const mockMessageBody: IMessage = {
    NotificationID: '1234',
    DepartmentID: 'TEST01',
    UserID: 'UserID',
    NotificationTitle: 'Hi there',
    NotificationBody: 'You have a new message in the message center',
    MessageTitle: 'Hi there',
    MessageBody: 'MOCK_LONG_MESSAGE',
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
    // Reset all mock
    vi.clearAllMocks();
    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    // Mocking successful completion of service functions
    serviceMocks.processingQueueServiceMock.publishMessageBatch.mockResolvedValue(undefined);
    serviceMocks.processingQueueServiceMock.publishMessage.mockResolvedValue(undefined);
    serviceMocks.inboundDynamoRepositoryMock.createRecordBatch.mockResolvedValue(undefined);
    serviceMocks.analyticsServiceMock.publishMultipleEvents.mockResolvedValue(undefined);
    serviceMocks.analyticsServiceMock.publishEvent.mockResolvedValue(undefined);

    await serviceMocks.analyticsQueueServiceMock.initialize();
    instance = new Validation(serviceMocks.configurationServiceMock, observabilityMocks, () => ({
      analyticsService: Promise.resolve(serviceMocks.analyticsServiceMock),
      inboundTable: Promise.resolve(serviceMocks.inboundDynamoRepositoryMock),
      processingQueue: serviceMocks.processingQueueServiceMock.initialize(),
    }));
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('validation');
  });

  it('should log when the handler is called and when it completes successfully.', async () => {
    // Arrange
    const mockIncomingEvent = {
      Records: [
        {
          ...mockEvent.Records[0],
          body: JSON.stringify(mockEvent.Records[0].body),
        },
      ],
    };
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue('');
    serviceMocks.configurationServiceMock.getBooleanParameter.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    // Act
    await handler(mockIncomingEvent as never, mockContext);

    // Assert
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith(`Request received`, { event: mockEvent });
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith(`Request completed`);
  });

  it('should log when the handler fails to parse the message body.', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue('');
    serviceMocks.configurationServiceMock.getBooleanParameter.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(observabilityMocks.logger.info).toHaveBeenCalledWith('Failed parsing JSON within SQS Body', {
      raw: mockEvent.Records[0].body,
    });
  });

  it.each([
    [`true`, `false`],
    [`false`, `true`],
  ])('should obey SSM Enabled flags Common: %s Validation: %s', async (commonEnabled: string, validation: string) => {
    // Arrange
    mockParameterStore[BoolParameters.Config.Common.Enabled] = commonEnabled;
    if (validation == `false`) {
      mockParameterStore[BoolParameters.Config.Validation.Enabled] = validation;
    }
    // Act & Assert
    await expect(handler(mockEvent, mockContext)).rejects.toThrow(
      new Error(
        `Function disabled due to config/common/enabled or config/validation/enabled SSM param being toggled off`
      )
    );
  });

  it('should publish analytics events', async () => {
    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishMultipleEvents).toHaveBeenCalledWith(
      [
        {
          DepartmentID: mockMessageBody.DepartmentID,
          NotificationID: mockMessageBody.NotificationID,
          UserID: mockMessageBody.UserID,
        },
      ],
      'VALIDATING'
    );
    expect(serviceMocks.analyticsServiceMock.publishMultipleEvents).toHaveBeenCalledWith(
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
      'VALIDATED'
    );
  });

  it('should send a message to processing queue', async () => {
    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.processingQueueServiceMock.publishMessageBatch).toHaveBeenCalledWith([mockMessageBody]);
  });

  it('should store data in the inbound message table', async () => {
    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.inboundDynamoRepositoryMock.createRecordBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        ...mockMessageBody,
        ReceivedDateTime: '202601021513',
      }),
    ]);
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
      'VALIDATING'
    );
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenNthCalledWith(
      1,
      {
        NotificationID: 'invalid-id',
        DepartmentID: 'invalid-id',
      },
      'VALIDATION_FAILED',
      expect.stringContaining('')
    );
  });

  it('should log when a message has no NotificationID or DepartmentID', async () => {
    // Act
    await instance.handler()(mockUnidentifiableEvent, mockContext);

    // Assert
    expect(observabilityMocks.logger.error).toHaveBeenCalledWith(
      `Supplied message does not contain NotificationID or DepartmentID, rejecting record`,
      {
        errors: '✖ Invalid input: expected string, received undefined\n  → at body.NotificationID',
        raw: mockUnidentifiableEvent.Records[0],
      }
    );
  });
});
