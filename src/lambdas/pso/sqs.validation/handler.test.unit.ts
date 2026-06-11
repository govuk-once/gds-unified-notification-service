import { FullBatchFailureError } from '@aws-lambda-powertools/batch';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { SQSClient } from '@aws-sdk/client-sqs';
import { ServiceMisconfigurationError, SimulatedError } from '@common/models/Errors/InternalServerError';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { QueueEvent } from '@common/operations';
import { MetricsLabels } from '@common/services';
import { BoolParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { Validation } from '@project/lambdas/pso/sqs.validation/handler';
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
    NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d1',
    DepartmentID: 'TEST01',
    UserID: 'UserID',
    CampaignID: 'CAM_ID',
    NotificationTitle: 'Hi there',
    NotificationBody: 'You have a new message in the message center',
    MessageTitle: 'Hi there',
    MessageBody: 'MOCK_LONG_MESSAGE',
  };

  const mockEvent: QueueEvent<IMessage> = {
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
        body: mockMessageBody,
      },
    ],
  };

  const mockFailedEvent: QueueEvent<IMessage> = {
    Records: [
      {
        ...mockEvent.Records[0],
        body: {
          NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d1',
          UserID: 'invalid-id',
          DepartmentID: 'invalid-id',
          // Missed out on purpose NotificationTitle, NotificationBody
        },
      },
    ],
  } as unknown as QueueEvent<IMessage>;

  const mockPartialFailedEvent: QueueEvent<IMessage> = {
    Records: [mockEvent.Records[0], mockFailedEvent.Records[0]],
  };

  const mockUnidentifiableEvent: QueueEvent<IMessage> = {
    Records: [
      {
        ...mockEvent.Records[0],
        body: {
          // Set DepartmentID to undefined on purpose
          UserID: 'invalid-id',
          DepartmentID: undefined,
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
    serviceMocks.processingQueueServiceMock.publishMessage.mockResolvedValue(undefined);
    serviceMocks.notificationsDynamoRepositoryMock.createRecord.mockResolvedValue(undefined);
    serviceMocks.analyticsServiceMock.publishEvent.mockResolvedValue(undefined);

    await serviceMocks.analyticsQueueServiceMock.initialize();
    instance = new Validation(
      serviceMocks.configurationServiceMock,
      observabilityMocks,
      serviceMocks.contentValidationServiceMock,
      () => ({
        analyticsService: Promise.resolve(serviceMocks.analyticsServiceMock),
        notificationsRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
        processingQueue: serviceMocks.processingQueueServiceMock.initialize(),
      })
    );
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

  it('should throw an error when the message title equals "FAIL_AT_VALIDATION".', async () => {
    // Arrange
    const mockFailOnTriggerEvent = {
      Records: [{ ...mockEvent.Records[0], body: { ...mockMessageBody, NotificationTitle: 'FAIL_AT_VALIDATION' } }],
    };

    // Act
    const result = handler(mockFailOnTriggerEvent, mockContext);

    // Assert
    await expect(result).rejects.toThrow(new SimulatedError(['Simulating an error!']));
  });

  it.each([
    [`false`, `true`, `Service is disabled due to parameter config/common/enabled being set to false`],
    [`true`, `false`, `Service is disabled due to parameter config/validation/enabled being set to false`],
  ])(
    'should obey SSM Enabled flags Common: %s Processing: %s with expect errorMsg: %s',
    async (commonEnabled: string, validationEnabled: string, expectErrorMessage: string) => {
      // Arrange
      mockParameterStore[BoolParameters.Config.Common.Enabled] = commonEnabled;
      mockParameterStore[BoolParameters.Config.Validation.Enabled] = validationEnabled;

      // Act
      const result = handler(mockEvent, mockContext);

      // Assert
      await expect(result).rejects.toThrow(new ServiceMisconfigurationError());
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith(expectErrorMessage);
    }
  );

  it('should publish analytics events when lambda beings validating record.', async () => {
    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: mockMessageBody.DepartmentID,
        NotificationID: mockMessageBody.NotificationID,
        UserID: mockMessageBody.UserID,
        CampaignID: mockMessageBody.CampaignID,
      },
      NotificationStateEnum.VALIDATING
    );
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: mockMessageBody.DepartmentID,
        MessageBody: mockMessageBody.MessageBody,
        MessageTitle: mockMessageBody.MessageTitle,
        NotificationBody: mockMessageBody.NotificationBody,
        NotificationID: mockMessageBody.NotificationID,
        NotificationTitle: mockMessageBody.NotificationTitle,
        UserID: mockMessageBody.UserID,
        CampaignID: mockMessageBody.CampaignID,
      },
      NotificationStateEnum.VALIDATED
    );
  });

  it('should send a message to processing queue', async () => {
    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.processingQueueServiceMock.publishMessage).toHaveBeenCalledWith(mockMessageBody);
  });

  it('should store data in the notifications message table', async () => {
    // Act
    await handler(mockEvent, mockContext);

    // Assert
    expect(serviceMocks.notificationsDynamoRepositoryMock.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        ...mockMessageBody,
        ReceivedDateTime: '202601021513',
      })
    );
  });

  it('should validate messages with valid markdown.', async () => {
    // Arrange
    const mockMarkdownMessageBody = {
      ...mockMessageBody,
      MessageBody:
        'This is a **long message** containing structural details that are valid under the markdown rules. We want to ensure that *all* allowable elements function seamlessly.',
    };
    const mockEventWithMarkdown: QueueEvent<IMessage> = {
      Records: [
        {
          ...mockEvent.Records[0],
          body: mockMarkdownMessageBody,
        },
      ],
    };

    // Act
    await handler(mockEventWithMarkdown, mockContext);

    // Assert
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: mockMarkdownMessageBody.DepartmentID,
        MessageBody: mockMarkdownMessageBody.MessageBody,
        MessageTitle: mockMarkdownMessageBody.MessageTitle,
        NotificationBody: mockMarkdownMessageBody.NotificationBody,
        NotificationID: mockMarkdownMessageBody.NotificationID,
        NotificationTitle: mockMarkdownMessageBody.NotificationTitle,
        UserID: mockMarkdownMessageBody.UserID,
        CampaignID: mockMarkdownMessageBody.CampaignID,
      },
      NotificationStateEnum.VALIDATED
    );
  });

  it('should reject messages that contain invalid markdown.', async () => {
    // Arrange
    const mockInvalidMarkdownMessageBody = {
      ...mockMessageBody,
      MessageBody: '# Heading\n\nThis is a [link](https://example.com) with an unapproved hostname.',
    };
    const mockEventInvalidMarkdown: QueueEvent<IMessage> = {
      Records: [
        {
          ...mockEvent.Records[0],
          body: mockInvalidMarkdownMessageBody,
        },
      ],
    };

    // Act
    const result = handler(mockEventInvalidMarkdown, mockContext);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        DepartmentID: mockMessageBody.DepartmentID,
        NotificationID: mockMessageBody.NotificationID,
        UserID: mockMessageBody.UserID,
        CampaignID: mockMessageBody.CampaignID,
      },
      NotificationStateEnum.VALIDATION_FAILED,
      ['https://example.com is using example.com hostname which is not on the allow list → at body.MessageBody.']
    );
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
      MetricsLabels.BATCH_ITEM_FAILURES_VALIDATION,
      MetricUnit.Count,
      1
    );
  });

  it('should return and error and trigger analytics for failed events', async () => {
    // Act
    const result = handler(mockFailedEvent, mockContext);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        NotificationID: mockFailedEvent.Records[0].body.NotificationID,
        DepartmentID: mockFailedEvent.Records[0].body.DepartmentID,
        CampaignID: mockFailedEvent.Records[0].body.CampaignID,
        UserID: mockFailedEvent.Records[0].body.UserID,
      },
      NotificationStateEnum.VALIDATING
    );
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        NotificationID: mockFailedEvent.Records[0].body.NotificationID,
        DepartmentID: mockFailedEvent.Records[0].body.DepartmentID,
        UserID: mockFailedEvent.Records[0].body.UserID,
        CampaignID: mockFailedEvent.Records[0].body.CampaignID,
      },
      NotificationStateEnum.VALIDATION_FAILED,
      [
        'Invalid input: expected string, received undefined → at body.NotificationTitle.',
        'Invalid input: expected string, received undefined → at body.NotificationBody.',
      ]
    );
  });

  it('should return and error and log when a message has no DepartmentID', async () => {
    // Act
    const result = instance.handler()(mockUnidentifiableEvent, mockContext);

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(observabilityMocks.logger.error).toHaveBeenCalledWith(
      `Supplied message does not contain NotificationID or DepartmentID, rejecting record`,
      {
        error: '✖ Invalid input: expected string, received undefined\n  → at body.DepartmentID',
        raw: mockUnidentifiableEvent.Records[0].body,
      }
    );
  });

  it('should return an error and reject message with unknown deeplinks', async () => {
    // Act
    const result = handler(
      {
        ...mockEvent,
        Records: [
          { ...mockEvent.Records[0], body: { ...mockEvent.Records[0].body, MessageBody: 'https://example.com' } },
        ],
      },
      mockContext
    );

    // Assert
    await expect(result).rejects.toThrow(FullBatchFailureError);
    expect(serviceMocks.analyticsServiceMock.publishEvent).toHaveBeenCalledWith(
      {
        NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d1',
        DepartmentID: 'TEST01',
        CampaignID: 'CAM_ID',
        UserID: 'UserID',
      },
      'VALIDATION_FAILED',
      [`https://example.com is using example.com hostname which is not on the allow list → at body.MessageBody.`]
    );
  });
});
