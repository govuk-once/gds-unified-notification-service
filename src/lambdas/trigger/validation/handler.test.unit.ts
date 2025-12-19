import { QueueEvent } from "@common/operations";
import { Validation } from "@project/lambdas/trigger/validation/handler";
import { Context } from 'aws-lambda';

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

  it('should log "Lambda triggered" when implementation is called', async () => {
    // Arrange
    vi.spyOn(instance.logger, "trace");

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(instance.logger.trace).toHaveBeenCalledWith('Lambda triggered');
  });
});
