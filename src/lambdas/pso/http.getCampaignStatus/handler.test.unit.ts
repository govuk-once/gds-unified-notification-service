import { IRequestEvent } from '@common/middlewares';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { GetCampaignStatus } from '@project/lambdas/pso/http.getCampaignStatus/handler';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('GetCampaignStatus Handler', () => {
  let instance: GetCampaignStatus;
  let mockContext: Context;
  let mockEvent: IRequestEvent;

  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  let handler: ReturnType<typeof GetCampaignStatus.prototype.handler>;

  const mockCampaignID = 'CAMP01';
  const mockDepartmentID = 'DEPO1';
  const mockCampaignRecord = {
    CompositeID: `${mockDepartmentID}/${mockCampaignID}`,
    VALIDATING: 1,
    VALIDATED: 1,
    VALIDATED_API_CALL: 1,
    PROCESSING: 1,
    PROCESSED: 1,
    PROCESSING_FAILED: 1,
    DISPATCHING: 1,
    DISPATCHED: 1,
    DISPATCHING_FAILED: 1,
    RECEIVED: 1,
    READ: 1,
    MARKED_AS_UNREAD: 1,
    HIDDEN: 1,
  };

  const mockPartialCampaignRecord = {
    CompositeID: `${mockDepartmentID}/${mockCampaignID}`,
    VALIDATING: 1,
  };

  beforeEach(() => {
    instance = new GetCampaignStatus(observabilityMocks, () => ({
      campaignsDynamoRepository: Promise.resolve(serviceMocks.campaignsDynamoRepositoryMock),
    }));
    type EventType = Parameters<typeof handler>[0];

    // Mock AWS Lambda Context
    mockContext = {
      functionName: 'getCampaignStatus',
      awsRequestId: '12345',
    } as unknown as Context;

    // Mock the QueueEvent (Mapping to your InputType)
    mockEvent = {
      headers: {
        'x-api-key': 'mockApiKey',
      },
      requestContext: {
        requestTimeEpoch: 1428582896000,
        requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
      },
      pathParameters: {
        campaignID: mockCampaignID,
      },
      queryParameters: {
        departmentID: mockDepartmentID,
      },
    } as unknown as EventType;

    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('getCampaignStatus');
  });

  it('should return the campaign status from DynamoDB', async () => {
    // Arrange
    serviceMocks.campaignsDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValue(mockCampaignRecord);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result).toEqual(
      expect.objectContaining({
        body: JSON.stringify(
          {
            CampaignID: mockCampaignID,
            DepartmentID: mockDepartmentID,
            ProcessingSummary: {
              VALIDATING: 1,
              VALIDATED: 1,
              VALIDATED_API_CALL: 1,
              PROCESSING: 1,
              PROCESSED: 1,
              PROCESSING_FAILED: 1,
              DISPATCHING: 1,
              DISPATCHED: 1,
              DISPATCHING_FAILED: 1,
            },
            UsageSummary: {
              RECEIVED: 1,
              READ: 1,
              MARKED_AS_UNREAD: 1,
              HIDDEN: 1,
            },
          },
          null,
          2
        ),
        statusCode: 200,
      })
    );
  });

  it('should return the campaign status from DynamoDB with all events returned even if some arent present in the record.', async () => {
    // Arrange
    serviceMocks.campaignsDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValue(mockPartialCampaignRecord);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result).toEqual(
      expect.objectContaining({
        body: JSON.stringify(
          {
            CampaignID: mockCampaignID,
            DepartmentID: mockDepartmentID,
            ProcessingSummary: {
              VALIDATING: 1,
              VALIDATED: 0,
              VALIDATED_API_CALL: 0,
              PROCESSING: 0,
              PROCESSED: 0,
              PROCESSING_FAILED: 0,
              DISPATCHING: 0,
              DISPATCHED: 0,
              DISPATCHING_FAILED: 0,
            },
            UsageSummary: {
              RECEIVED: 0,
              READ: 0,
              MARKED_AS_UNREAD: 0,
              HIDDEN: 0,
            },
          },
          null,
          2
        ),
        statusCode: 200,
      })
    );
  });

  it('should return 404 if campaign is not found', async () => {
    // Arrange
    serviceMocks.campaignsDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValue(null);

    // Act
    const result = await handler(mockEvent, mockContext);

    // Assert
    expect(result).toEqual(
      expect.objectContaining({
        statusCode: 404,
      })
    );
  });
});
