import { QueueEvent } from '@common/operations';
import { Configuration } from '@common/services/configuration';
import { QueueService } from '@common/services/queueService';
import { Validation } from '@project/lambdas/trigger/validation/handler';
import { Context } from 'aws-lambda';

vi.mock('@common/services/queueService');
vi.mock('@common/services/configuration');

describe('Validation QueueHandler', () => {
  let instance: Validation = new Validation();
  let mockContext: Context;
  let mockEvent: QueueEvent<undefined>;

  beforeEach(() => {
    instance = new Validation();

    // Mock AWS Lambda Context
    mockContext = {
      functionName: 'validation',
      awsRequestId: '12345',
    } as unknown as Context;

    // Mock the QueueEvent (Mapping to your InputType)
    mockEvent = { Records: [] };
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('validation');
  });

  it('should log send a message to an sqs queue when implementation is called', async () => {
    // Arrange
    vi.spyOn(Configuration.prototype, 'getParameter').mockResolvedValue('mockUrl');
    const mockPublish = vi.spyOn(QueueService.prototype, 'publishMessage').mockResolvedValue(undefined);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(mockPublish).toHaveBeenCalledWith(
      {
        Title: {
          DataType: 'String',
          StringValue: 'Test Message',
        },
      },
      'Test message body.'
    );
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
