/* eslint-disable @typescript-eslint/unbound-method */
import { SQSClient } from '@aws-sdk/client-sqs';
import { QueueEvent } from '@common/operations';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { Processing } from '@project/lambdas/trigger/processing/handler';
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

  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

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

    // Mocking successful completion of service functions
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce(`sqsurl/sqsname`);
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
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('processing');
  });

  it.each([
    [`enabled`, `disabled`],
    [`disabled`, `enabled`],
  ])('should obey SSM Enabled flags Common: %s Processing: %s', async (commonEnabled: string, processing: string) => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue('');
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue('');
    serviceMocks.configurationServiceMock.getBooleanParameter.mockResolvedValueOnce(commonEnabled == `enabled`);
    if (processing == `disabled`) {
      serviceMocks.configurationServiceMock.getBooleanParameter.mockResolvedValueOnce(
        (processing as string) == `enabled`
      );
    }

    // Act & Assert
    await expect(instance.implementation(mockEvent, mockContext)).rejects.toThrow(
      new Error(
        `Function disabled due to config/common/enabled or config/processing/enabled SSM param being toggled off`
      )
    );
  });

  it('should publish analytics events', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue('');
    serviceMocks.configurationServiceMock.getBooleanParameter.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    // Act
    await instance.implementation(mockEvent, mockContext);

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
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue('');
    serviceMocks.configurationServiceMock.getBooleanParameter.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    vi.useFakeTimers();
    const date = new Date();
    vi.setSystemTime(date);

    // Act
    await instance.implementation(mockEvent, mockContext);

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
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue('');
    serviceMocks.configurationServiceMock.getBooleanParameter.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    // Act
    await instance.implementation(mockFailedEvent, mockContext);

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
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue('');
    serviceMocks.configurationServiceMock.getBooleanParameter.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    // Act
    await instance.implementation(mockUnidentifiableEvent, mockContext);

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
