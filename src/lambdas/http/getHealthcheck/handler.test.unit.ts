/* eslint-disable @typescript-eslint/unbound-method */
import { ITypedRequestEvent } from '@common/middlewares';
import { injectObservabilityMocks } from '@common/utils/testServices';
import { GetHealthcheck } from '@project/lambdas/http/getHealthcheck/handler';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

describe('GetHealthcheck Handler', () => {
  let instance: GetHealthcheck;
  let mockContext: Context;
  let mockEvent: ITypedRequestEvent<undefined>;

  const observabilityMocks = injectObservabilityMocks();

  beforeEach(() => {
    instance = new GetHealthcheck(
      observabilityMocks.loggerMock,
      observabilityMocks.metricsMock,
      observabilityMocks.tracerMock
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
    expect(observabilityMocks.loggerMock.info).toHaveBeenCalledWith('Received request');
  });
});
