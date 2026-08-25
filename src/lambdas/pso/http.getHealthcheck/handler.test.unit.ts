import { IRequestEvent } from '@common/middlewares';
import { mockEventContext, observabilitySpies } from '@common/utils';
import { GetHealthcheck } from '@project/lambdas/pso/http.getHealthcheck/handler';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

describe('GetHealthcheck Handler', () => {
  let instance: GetHealthcheck;

  const observabilityMocks = observabilitySpies();

  // Test Fixtures
  let context: Context;
  let event: IRequestEvent;

  beforeEach(() => {
    // Test Fixtures
    context = mockEventContext('getNotificationStatus');
    event = {} as unknown as IRequestEvent;

    instance = new GetHealthcheck(observabilityMocks);
  });

  it('should log "Received request" when implementation is called', async () => {
    // Arrange
    const result = await instance.implementation(event, context);

    // Assert
    expect(result).toEqual({
      body: { status: 'ok' },
      statusCode: 200,
    });
  });
});
