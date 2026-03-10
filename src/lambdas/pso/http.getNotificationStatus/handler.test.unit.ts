import { IRequestEvent } from '@common/middlewares';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { GetNotificationStatus } from '@project/lambdas/pso/http.getNotificationStatus/handler';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('GetNotificationStatus Handler', () => {
  let instance: GetNotificationStatus;
  let mockContext: Context;
  let mockEvent: IRequestEvent;

  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);
  let handler: ReturnType<typeof GetNotificationStatus.prototype.handler>;
  beforeEach(() => {
    instance = new GetNotificationStatus(observabilityMocks, () => ({
      inboundNotificationTable: Promise.resolve(serviceMocks.inboundDynamoRepositoryMock),
    }));

    // Mock AWS Lambda Context
    mockContext = {
      functionName: 'getNotificationStatus',
      awsRequestId: '12345',
    } as unknown as Context;

    // Mock the QueueEvent (Mapping to your InputType)
    mockEvent = {} as unknown as typeof mockEvent;
    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('getNotificationStatus');
  });

  it('should log "Received request" when implementation is called', async () => {
    // Arrange
    serviceMocks.inboundDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValue(undefined);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result).toEqual(
      expect.objectContaining({
        body: 'Not Found',
        statusCode: 404,
      })
    );
  });
});
