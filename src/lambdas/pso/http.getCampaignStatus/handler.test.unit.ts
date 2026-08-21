import { mockCampaignRecord, mockPartialCampaignRecord } from '@common/repositories';
import { mockAPIEvent, mockEventContext } from '@common/utils/mockEvents.test.utils';
import { awsClientSpies, observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { GetCampaignStatus } from '@project/lambdas/pso/http.getCampaignStatus/handler';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('GetCampaignStatus Handler', () => {
  let instance: GetCampaignStatus;
  type EventType = Parameters<typeof handler>[0];
  let handler: ReturnType<typeof GetCampaignStatus.prototype.handler>;

  // Initialize the mock service and repository layers
  const observabilityMocks = observabilitySpies();
  const awsClientMocks = awsClientSpies();
  const serviceMocks = ServiceSpies(observabilityMocks, awsClientMocks);

  // Test Fixtures
  const campaignID = 'CAMP01';
  const organisationID = 'ORG01';

  const context = mockEventContext('getCampaignStatus');
  const campaignRecord = mockCampaignRecord(organisationID, campaignID);
  const partialCampaignRecord = mockPartialCampaignRecord(organisationID, campaignID);

  beforeEach(() => {
    vi.resetAllMocks();

    serviceMocks.campaignsDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValue(campaignRecord);

    instance = new GetCampaignStatus(observabilityMocks, () => ({
      campaignsDynamoRepository: Promise.resolve(serviceMocks.campaignsDynamoRepositoryMock),
    }));

    handler = instance.handler();
  });

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('getCampaignStatus');
  });

  it('should return the campaign status from DynamoDB', async () => {
    // Arrange
    const event = mockAPIEvent({ pathParameters: { campaignID } }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result).toEqual(
      expect.objectContaining({
        body: JSON.stringify(
          {
            CampaignID: campaignID,
            DepartmentID: organisationID,
            ProcessingSummary: {
              RECEIVED: 1,
              PROCESSED: 1,
              DISPATCHED: 1,
            },
            UsageSummary: {
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

  it("should return the campaign status from DynamoDB with all events returned even if some aren't present in the record.", async () => {
    // Arrange
    serviceMocks.campaignsDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValue(partialCampaignRecord);
    const event = mockAPIEvent({ pathParameters: { campaignID } }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result).toEqual(
      expect.objectContaining({
        body: JSON.stringify(
          {
            CampaignID: campaignID,
            DepartmentID: organisationID,
            ProcessingSummary: {
              RECEIVED: 0,
              PROCESSED: 0,
              DISPATCHED: 0,
            },
            UsageSummary: {
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
    const event = mockAPIEvent({ pathParameters: { campaignID } }) as unknown as EventType;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(404);
    expect(JSON.parse(result.body)).toEqual({ Status: 404, HttpError: 'NotFound', Errors: [] });
  });

  it('should return 400 if organisation is missing', async () => {
    // Arrange
    const event = mockAPIEvent({ pathParameters: { campaignID } }) as unknown as EventType;
    event.requestContext.authorizer = undefined;

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['Missing DepartmentID'],
    });
  });

  it('should look up org/department/campaign key when departmentID query param is provided', async () => {
    // Arrange
    const event = mockAPIEvent({ pathParameters: { campaignID } }) as unknown as EventType;
    const departmentID = 'DEPO1';
    event.queryStringParameters = { departmentID };

    const threePartRecord = {
      ...mockCampaignRecord,
      CompositeID: `${organisationID}/${departmentID}/${campaignID}`,
    };
    serviceMocks.campaignsDynamoRepositoryMock.getRecord = vi.fn().mockResolvedValue(threePartRecord);

    // Act
    const result = await handler(event, context);

    // Assert
    expect(serviceMocks.campaignsDynamoRepositoryMock.getRecord).toHaveBeenCalledWith(
      `${organisationID}/${departmentID}/${campaignID}`
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as {
      CampaignID: string;
      DepartmentID: string;
    };

    expect(body.CampaignID).toBe(campaignID);
    expect(body.DepartmentID).toBe(departmentID);
  });
});
