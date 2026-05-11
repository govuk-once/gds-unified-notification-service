import { DynamoDB, GetItemCommand, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { CampaignsDynamoRepository } from '@common/repositories/campaignsDynamoRepository';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { ICampaignRecord } from '@project/lambdas/interfaces/ICampaignRecord';
import { mockClient } from 'aws-sdk-client-mock';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services', { spy: true });

describe('campaignsDynamoRepository', () => {
  let instance: CampaignsDynamoRepository;

  // Initialize the mock service and repository layers
  const observabilityMock = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMock);
  const dynamoMock = mockClient(DynamoDB);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  beforeEach(async () => {
    vi.resetAllMocks();
    dynamoMock.reset();

    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    instance = new CampaignsDynamoRepository(serviceMocks.configurationServiceMock, observabilityMock);

    await instance.initialize();
  });

  describe('CreateCampaignRecord', () => {
    const recordBody: ICampaignRecord = {
      CompositeID: 'DEPT01/CAMP01',
    };

    it('should put record with correct table name', async () => {
      // Arrange and Act
      await instance.createRecord(recordBody);

      // Assert
      expect(dynamoMock.calls()).toHaveLength(1);
      const command = dynamoMock.call(0).args[0] as PutItemCommand;
      expect(command.input.TableName).toBe('mockCampaignsDynamoRepositoryName');
      expect(unmarshall(command.input.Item!)).toMatchObject(recordBody);
    });
  });

  describe('UpdateCampaignRecord', () => {
    it('should update record with correct table name', async () => {
      // Arrange
      const partialRecord: Partial<ICampaignRecord> = {
        CompositeID: 'DEPT01/CAMP01',
      };

      // Act
      await instance.updateRecord(partialRecord);

      // Assert
      expect(dynamoMock.calls()).toHaveLength(1);
      const command = dynamoMock.call(0).args[0] as UpdateItemCommand;
      expect(command.input.TableName).toBe('mockCampaignsDynamoRepositoryName');
      expect(command.input.Key).toEqual(marshall({ CompositeID: 'DEPT01/CAMP01' }));
    });
  });

  describe('GertCampaignRecord', () => {
    it('should get record with correct table name', async () => {
      // Arrange
      const mockRecord: ICampaignRecord = { CompositeID: 'DEPT01/CAMP01' };
      dynamoMock.on(GetItemCommand).resolves({ Item: marshall(mockRecord) });

      // Act
      const result = await instance.getRecord('DEPT01/CAMP01');

      // Assert
      expect(result).toEqual(mockRecord);
    });

    it('should return null if item is not found', async () => {
      // Arrange
      dynamoMock.on(GetItemCommand).resolves({});

      // Act
      const result = await instance.getRecord('DEPT01/CAMP01');

      // Assert
      expect(result).toBeNull();
    });

    it('should log error if request fails', async () => {
      // Arrange
      const errorMessage = 'Connection Failure';
      dynamoMock.on(GetItemCommand).rejectsOnce(new Error(errorMessage));

      // Act
      const result = await instance.getRecord('DEPT01/CAMP01');

      // Assert
      expect(observabilityMock.logger.error).toHaveBeenCalledWith(
        `Failure in getting record for table: ${'mockCampaignsDynamoRepositoryName'}. Error: ${errorMessage}`
      );
    });
  });
});
