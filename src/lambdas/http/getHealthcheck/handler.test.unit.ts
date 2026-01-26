import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { ITypedRequestEvent } from '@common/middlewares';
import { GetHealthcheck } from '@project/lambdas/http/getHealthcheck/handler';
import { Context } from 'aws-lambda';

vi.mock('@common/ioc', () => ({
  iocGetLogger: vi.fn(),
  iocGetMetrics: vi.fn(),
  iocGetTracer: vi.fn(),
}));

describe('GetHealthcheck Handler', () => {
  let instance: GetHealthcheck;
  let mockContext: Context;
  let mockEvent: ITypedRequestEvent<undefined>;

  const info = vi.fn();
  const addMetric = vi.fn();
  const error = vi.fn();
  const putAnnotation = vi.fn();
  const putMetadata = vi.fn();

  beforeEach(() => {
    instance = new GetHealthcheck(
      { info, error } as unknown as Logger,
      { addMetric } as unknown as Metrics,
      { putAnnotation, putMetadata } as unknown as Tracer
    );

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
    await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(info).toHaveBeenCalledWith('Received request');
  });
});
