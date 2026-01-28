/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { ITypedRequestEvent } from '@common/middlewares';
import { GetHealthcheck } from '@project/lambdas/http/getHealthcheck/handler';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

describe('GetHealthcheck Handler', () => {
  let instance: GetHealthcheck;
  let mockContext: Context;
  let mockEvent: ITypedRequestEvent<undefined>;

  const loggerMock = vi.mocked(new Logger());
  const metricsMock = vi.mocked(new Metrics());
  const tracerMock = vi.mocked(new Tracer());

  beforeEach(() => {
    instance = new GetHealthcheck(loggerMock, metricsMock, tracerMock);

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
    expect(loggerMock.info).toHaveBeenCalledWith('Received request');
  });
});
