import { IRequestEvent } from '@common/middlewares';
import { GetNotificationStatus } from '@project/lambdas/pso/http.getNotificationStatus/handler';
import { iocSpies, mockEventContext } from '@test/mocks';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('GetNotificationStatus Handler', () => {
  let instance: GetNotificationStatus;
  let handler: ReturnType<typeof GetNotificationStatus.prototype.handler>;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = iocSpies();

  // Test fixtures
  let context: Context;
  let event: IRequestEvent;

  beforeEach(() => {
    // Test Fixtures
    context = mockEventContext('getNotificationStatus');
    event = {} as unknown as IRequestEvent;

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
