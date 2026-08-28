import { mockCampaignRecord, mockPartialCampaignRecord } from '@common/repositories';
import { GetCampaignStatus } from '@project/lambdas/pso/http.getCampaignStatus/handler';
import { iocSpies, mockEventContext, mockPsoAPIEvent, mockServicesExpectedBehaviour } from '@test/mocks';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('GetCampaignStatus Handler', async () => {
  let instance: GetCampaignStatus;
  type EventType = Parameters<typeof handler>[0];
  let handler: ReturnType<typeof GetCampaignStatus.prototype.handler>;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = await iocSpies();

  // Test Fixtures
  let context: Context;
  let event: EventType;

  const campaignID = 'CAMP01';
  const organisationID = 'ORG01';
  const campaignRecord = mockCampaignRecord(organisationID, campaignID);
  const partialCampaignRecord = mockPartialCampaignRecord(organisationID, campaignID);

  beforeEach(() => {
    // Reset all mocks
    vi.resetAllMocks();

    // Test Fixtures
    context = mockEventContext('getCampaignStatus');
    event = mockPsoAPIEvent({ pathParameters: { campaignID } }) as unknown as EventType;

    // Mock SSM store and services responses
    mockServicesExpectedBehaviour(serviceMocks);

    // Mocking successful completion of service functions
    serviceMocks.campaignsDynamoRepositoryMock.getRecord.mockResolvedValue(campaignRecord);

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
    serviceMocks.campaignsDynamoRepositoryMock.getRecord.mockResolvedValue(partialCampaignRecord);

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
    serviceMocks.campaignsDynamoRepositoryMock.getRecord.mockResolvedValue(null);

    // Act
    const result = await handler(event, context);

    // Assert
    expect(result.statusCode).toEqual(404);
    expect(JSON.parse(result.body)).toEqual({ Status: 404, HttpError: 'NotFound', Errors: [] });
  });

  it('should return 400 if organisation is missing', async () => {
    // Arrange
    const eventMissingOrganisation = {
      ...event,
      requestContext: {
        ...event.requestContext,
        authorizer: undefined,
      },
    };

    // Act
    const result = await handler(eventMissingOrganisation, context);

    // Assert
    expect(result.statusCode).toEqual(400);
    expect(JSON.parse(result.body)).toEqual({
      Status: 400,
      HttpError: 'BadRequest',
      Errors: ['OrganisationID is missing from request authorizer'],
    });
  });

  it('should look up org/department/campaign key when departmentID query param is provided', async () => {
    // Arrange
    const departmentID = 'DEPO1';
    const eventWithDepartID = mockPsoAPIEvent({
      pathParameters: { campaignID },
      queryStringParameters: { departmentID },
    }) as unknown as EventType;
    const threePartRecord = {
      ...campaignRecord,
      CompositeID: `${organisationID}/${departmentID}/${campaignID}`,
    };
    serviceMocks.campaignsDynamoRepositoryMock.getRecord.mockResolvedValue(threePartRecord);

    // Act
    const result = await handler(eventWithDepartID, context);

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
