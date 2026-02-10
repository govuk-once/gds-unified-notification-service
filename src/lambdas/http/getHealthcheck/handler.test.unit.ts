import { ITypedRequestEvent } from '@common/middlewares';
import { observabilitySpies } from '@common/utils/mockInstanceFactory.test.util';
import { GetHealthcheck } from '@project/lambdas/http/getHealthcheck/handler';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

describe('GetHealthcheck Handler', () => {
  let instance: GetHealthcheck;
  let mockContext: Context;
  let mockEvent: ITypedRequestEvent<undefined>;

  const observabilityMocks = observabilitySpies();

  beforeEach(() => {
    instance = new GetHealthcheck(observabilityMocks);

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
    const result = await instance.implementation(mockEvent, mockContext);

    // Assert
    expect(result).toEqual({
      body: { status: 'ok' },
      statusCode: 200,
    });
  });
});
