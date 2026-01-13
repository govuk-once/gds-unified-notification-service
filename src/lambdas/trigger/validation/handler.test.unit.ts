import { QueueEvent } from '@common/operations';
import { Configuration } from '@common/services/configuration';
import { QueueService } from '@common/services/queueService';
import { IMessage } from '@project/lambdas/interfaces/ITriggerValidation';
import { Validation } from '@project/lambdas/trigger/validation/handler';
import { Context } from 'aws-lambda';

vi.mock('@common/services/queueService');

describe('Validation QueueHandler', () => {
  let instance: Validation = new Validation();
  let mockContext: Context;
  let mockEvent: QueueEvent<IMessage>;

  beforeEach(() => {
    instance = new Validation();

    // Mock AWS Lambda Context
    mockContext = {
      functionName: 'validation',
      awsRequestId: '12345',
    } as unknown as Context;

    // Mock the QueueEvent (Mapping to your InputType)
    mockEvent = {
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
          eventSource: 'mockEventSource',
          eventSourceARN: 'mockEventSourceARN',
          awsRegion: 'eu-west2',
          body: {
            NotificationID: '1234',
            DepartmentID: 'DVLA01',
            UserID: 'UserID',
            MessageTitle: 'You have a new Message',
            MessageBody: 'Open Notification Centre to read your notifications',
            MessageTitleFull: 'You have a new medical driving license',
            MessageBodyFull: 'The DVLA has issued you a new license.',
          },
        },
      ],
    };
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('validation');
  });

  it('should log send a message to an sqs queue when implementation is called', async () => {
    // Arrange
    vi.spyOn(Configuration.prototype, 'getParameter').mockResolvedValue('mockUrl');
    const mockPublishBatch = vi.spyOn(QueueService.prototype, 'publishMessageBatch').mockResolvedValue(undefined);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(mockPublishBatch).toHaveBeenCalledWith([
      [
        {
          TestAttribute: {
            DataType: 'String',
            StringValue: 'Test Message',
          },
        },
        JSON.stringify({
          NotificationID: '1234',
          UserID: 'UserID',
          DepartmentID: 'DVLA01',
          MessageTitle: 'You have a new Message',
          MessageBody: 'Open Notification Centre to read your notifications',
          MessageTitleFull: 'You have a new medical driving license',
          MessageBodyFull: 'The DVLA has issued you a new license.',
        }),
      ],
    ]);
  });

  it('should throw an error if the queue url is not set in SSM.', async () => {
    // Arrange
    vi.spyOn(Configuration.prototype, 'getParameter').mockResolvedValue(undefined);

    // Act
    const result = instance.implementation(mockEvent, mockContext);

    // Assert
    await expect(result).rejects.toThrow(new Error('Validation Queue Url is not set.'));
  });
});
