import { DynamoDB, GetItemCommand, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { iocGetCampaignsDynamoRepository } from '@common/ioc';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { CampaignsDynamoRepository } from '@common/repositories/campaignsDynamoRepository';
import { StringParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { ICampaignRecord, ICampaignRecordSchema } from '@project/lambdas/interfaces/ICampaignRecord';
import { mockClient } from 'aws-sdk-client-mock';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services', { spy: true });

describe('campaignDynamoRepository', () => {
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

  describe('CampaignsDynamoRepository IoC', () => {
    it('should resolve from IoC container', async () => {
      // Arrange
      vi.spyOn(Object.getPrototypeOf(CampaignsDynamoRepository.prototype), 'initialize').mockResolvedValue(undefined);

      // Act
      const result = await iocGetCampaignsDynamoRepository();

      //Assert
      expect(result).toBeDefined();
    });

    it('should include campaignsDynamoRepositoryMock in Spies', () => {
      // Arrange, Act, Assert
      expect(serviceMocks.campaignsDynamoRepositoryMock).toBeDefined();
    });
  });

  describe('ICampaignRecordSchema', () => {
    it('should validate a valid campaign record', () => {
      // Arrange
      const record = { CompositeID: 'DEPT01/CAMP01' };

      // Act
      const result = ICampaignRecordSchema.safeParse(record);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should reject an invlaid campaign record', () => {
      // Arrange
      const record = { CompositeID: undefined };

      // Act
      const result = ICampaignRecordSchema.safeParse(record);

      // Assert
      expect(result.success).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should call initialize with correct params', async () => {
      // Arrange
      const initialize = vi
        .spyOn(Object.getPrototypeOf(CampaignsDynamoRepository.prototype), 'initialize')
        .mockResolvedValue(undefined);

      // Act
      const result = await instance.initialize();

      // Assert
      expect(initialize).toHaveBeenCalledWith(StringParameters.Table.Campaigns.Attributes);
      expect(result).toBe(instance);
    });
  });

  describe('GetCampaignRecord', () => {
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
      const error = new Error('Connection Failure');
      dynamoMock.on(GetItemCommand).rejectsOnce(error);

      // Act
      const result = instance.getRecord('DEPT01/CAMP01');

      // Assert
      await expect(result).rejects.toThrow(error);
      expect(observabilityMock.logger.error).toHaveBeenCalledWith('Failure in getting record for table', {
        tableName: 'mockCampaignsDynamoRepositoryName',
        error: error.message,
      });
    });
  });

  describe('GetCampaignRecords', () => {
    it('should get record with correct table name', async () => {
      // Arrange
      const mockRecords: ICampaignRecord[] = [{ CompositeID: 'DEPT01/CAMP01' }, { CompositeID: 'DEPT01/CAMP01' }];
      dynamoMock.on(ScanCommand).resolves({ Items: mockRecords.map((record) => marshall(record)) });

      // Act
      const result = await instance.getRecords();

      // Assert
      expect(result).toEqual(mockRecords);
    });

    it('should return empty array if no item are found', async () => {
      // Arrange
      dynamoMock.on(ScanCommand).resolves({ Items: [] });

      // Act
      const result = await instance.getRecords();

      // Assert
      expect(result).toEqual([]);
    });

    it('should log error if request fails', async () => {
      // Arrange
      const error = new Error('Connection Failure');
      dynamoMock.on(ScanCommand).rejectsOnce(error);

      // Act
      const result = instance.getRecords();

      // Assert
      await expect(result).rejects.toThrow(error);
      expect(observabilityMock.logger.error).toHaveBeenCalledWith('Failure in getting records for table', {
        tableName: 'mockCampaignsDynamoRepositoryName',
        error: error.message,
      });
    });
  });

  describe('buildCompositeID', () => {
    it('should build an organisation/department/campaign key when all parts are present', () => {
      // Arrange, Act, Assert
      const result = CampaignsDynamoRepository.buildCompositeID('ORG01', 'DEPT01', 'CAMP01');
      expect(result).toBe('ORG01/DEPT01/CAMP01');
    });

    it('should build an organisation/campaign key when department is absent', () => {
      // Arrange, Act, Assert
      const result = CampaignsDynamoRepository.buildCompositeID('ORG01', undefined, 'CAMP01');
      expect(result).toBe('ORG01/CAMP01');
    });
  });

  describe('IncrementCampaignRecord', () => {
    it('should increment record with an organisation/department/campaign composite key', async () => {
      // Arrange
      const campaignID = 'CAMP01';
      const organisationID = 'ORG01';
      const departmentID = 'DEPT01';
      const event = NotificationStateEnum.VALIDATED;

      dynamoMock.on(UpdateItemCommand).resolvesOnce({
        ConsumedCapacity: {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: 1,
        },
      });

      // Act
      await instance.incrementCampaigns(campaignID, organisationID, departmentID, event);

      // Assert
      expect(dynamoMock.calls()).toHaveLength(1);
      const command = dynamoMock.call(0).args[0] as UpdateItemCommand;
      expect(command.input.TableName).toBe('mockCampaignsDynamoRepositoryName');
      expect(command.input.Key).toEqual(marshall({ CompositeID: 'ORG01/DEPT01/CAMP01' }));
      expect(command.input.ExpressionAttributeNames).toEqual({ '#counter': event });
      expect(command.input.ExpressionAttributeValues).toEqual({
        ':incr': { N: '1' },
        ':start_value': { N: '0' },
      });
      expect(command.input.UpdateExpression).toEqual(`set #counter = if_not_exists(#counter, :start_value) + :incr`);
    });

    it('should increment record with an organisation/campaign composite key when department is absent', async () => {
      // Arrange
      const campaignID = 'CAMP01';
      const organisationID = 'ORG01';
      const event = NotificationStateEnum.VALIDATED;

      dynamoMock.on(UpdateItemCommand).resolvesOnce({
        ConsumedCapacity: {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: 1,
        },
      });

      // Act
      await instance.incrementCampaigns(campaignID, organisationID, undefined, event);

      // Assert
      const command = dynamoMock.call(0).args[0] as UpdateItemCommand;
      expect(command.input.Key).toEqual(marshall({ CompositeID: 'ORG01/CAMP01' }));
    });
  });
});
