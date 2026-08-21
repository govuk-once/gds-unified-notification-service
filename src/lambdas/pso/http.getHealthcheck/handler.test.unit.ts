import { IRequestEvent } from '@common/middlewares';
import { mockEventContext } from '@common/utils/mockEvents.test.utils';
import { observabilitySpies } from '@common/utils/mockInstanceFactory.test.util';
import { GetHealthcheck } from '@project/lambdas/pso/http.getHealthcheck/handler';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

describe('GetHealthcheck Handler', () => {
  let instance: GetHealthcheck;

  const observabilityMocks = observabilitySpies();

  // Test Fixtures
  const context = mockEventContext('getNotificationStatus');
  const event = {} as unknown as IRequestEvent;

  beforeEach(() => {
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
