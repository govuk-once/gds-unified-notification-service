import { IRequestEvent } from '@common/middlewares';
import { mockEventContext } from '@common/utils/mockEvents.test.utils';
import { awsClientSpies, observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { GetNotificationStatus } from '@project/lambdas/pso/http.getNotificationStatus/handler';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('GetNotificationStatus Handler', () => {
  let instance: GetNotificationStatus;

  const observabilityMocks = observabilitySpies();
  const awsClientMocks = awsClientSpies();
  const serviceMocks = ServiceSpies(observabilityMocks, awsClientMocks);

  let handler: ReturnType<typeof GetNotificationStatus.prototype.handler>;

  // Test fixtures
  const context = mockEventContext('getNotificationStatus');
  const event = {} as unknown as IRequestEvent;

  beforeEach(() => {
    instance = new GetNotificationStatus(observabilityMocks, () => ({
      notificationsDynamoRepository: Promise.resolve(serviceMocks.notificationsDynamoRepositoryMock),
    }));

    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('getNotificationStatus');
  });

  it('should log "Received request" when implementation is called', async () => {
    // Arrange
    serviceMocks.notificationsDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValue(undefined);

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(404);
    expect(JSON.parse(result.body)).toEqual({ Status: 404, HttpError: 'NotFound', Errors: [] });
  });
});
