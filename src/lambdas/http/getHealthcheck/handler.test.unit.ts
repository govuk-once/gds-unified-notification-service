import { ITypedRequestEvent } from '@common/middlewares';
import { GetHealthcheck } from '@project/lambdas/http/getHealthcheck/handler';
import { Context } from 'aws-lambda';

describe('GetHealthcheck Handler', () => {
  let instance: GetHealthcheck = new GetHealthcheck();
  let mockContext: Context;
  let mockEvent: ITypedRequestEvent<undefined>;

  beforeEach(() => {
    instance = new GetHealthcheck();

    // Mock AWS Lambda Context
    mockContext = {
      functionName: 'getHealthcehck',
      awsRequestId: '12345',
    } as unknown as Context;

    // Mock the QueueEvent (Mapping to your InputType)
    mockEvent = {} as unknown as typeof mockEvent;
  });

  it('should log "Received request" when implementation is called', async () => {
    // Arrange
    const info = vi.spyOn(instance.logger, 'info').mockImplementation(() => undefined);

    // Act
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(info).toHaveBeenCalledWith('Received request');
  });
});
