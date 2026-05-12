import {
  BatchWriteItemCommand,
  DeleteItemCommand,
  DynamoDB,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { CampaignsDynamoRepository } from '@common/repositories/campaignsDynamoRepository';
import { StringParameters } from '@common/utils';
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

    it('should log error if request fails', async () => {
      // Arrange
      const errorMessage = 'Connection Failure';
      dynamoMock.on(PutItemCommand).rejectsOnce(new Error(errorMessage));

      // Act
      await instance.createRecord(recordBody);

      // Assert
      expect(observabilityMock.logger.error).toHaveBeenCalledWith(
        `Failure in creating record table: ${'mockCampaignsDynamoRepositoryName'}. Error: ${errorMessage}`
      );
    });
  });

  describe('CreateCampaignRecordBatch', () => {
    const recordBody: ICampaignRecord = {
      CompositeID: 'DEPT01/CAMP01',
    };

    it('should create a PutRequest of record', async () => {
      // Arrange
      const records: ICampaignRecord[] = [recordBody];

      // Act
      await instance.createRecordBatch(records);

      // Assert
      expect(dynamoMock.calls()).toHaveLength(1);
      const command = dynamoMock.call(0).args[0] as BatchWriteItemCommand;
      expect(command.input.RequestItems).toEqual({
        mockCampaignsDynamoRepositoryName: [
          {
            PutRequest: {
              Item: marshall(recordBody),
            },
          },
        ],
      });
    });

    it('should log warning if empty list is returned', async () => {
      // Arrange
      const records: ICampaignRecord[] = [];

      // Act
      await instance.createRecordBatch(records);

      // Assert
      expect(observabilityMock.logger.warn).toHaveBeenCalledWith(`Triggered createRecordBatch with an empty array`);
    });

    it('should log error if theres a failure within the request', async () => {
      // Arrange
      const records: ICampaignRecord[] = [recordBody];
      const errorMessage = 'Connection Failure';
      dynamoMock.on(BatchWriteItemCommand).rejectsOnce(new Error(errorMessage));

      // Act
      await instance.createRecordBatch(records);

      // Assert
      expect(observabilityMock.logger.error).toHaveBeenCalledWith(
        `Failure in creating records table: mockCampaignsDynamoRepositoryName. Error: Connection Failure`
      );
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

    it('should log error if request fails', async () => {
      // Arrange
      const partialRecord: Partial<ICampaignRecord> = {
        CompositeID: 'DEPT01/CAMP01',
      };

      const errorMessage = 'Connection Failure';
      dynamoMock.on(UpdateItemCommand).rejectsOnce(new Error(errorMessage));

      // Act
      await instance.updateRecord(partialRecord);

      // Assert
      expect(observabilityMock.logger.error).toHaveBeenCalledWith(
        `Failure in updating record table: ${'mockCampaignsDynamoRepositoryName'}. Error: ${errorMessage}`,
        expect.any(Object)
      );
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
      const errorMessage = 'Connection Failure';
      dynamoMock.on(GetItemCommand).rejectsOnce(new Error(errorMessage));

      // Act
      await instance.getRecord('DEPT01/CAMP01');

      // Assert
      expect(observabilityMock.logger.error).toHaveBeenCalledWith(
        `Failure in getting record for table: ${'mockCampaignsDynamoRepositoryName'}. Error: ${errorMessage}`
      );
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
      const errorMessage = 'Connection Failure';
      dynamoMock.on(ScanCommand).rejectsOnce(new Error(errorMessage));

      // Act
      await instance.getRecords();

      // Assert
      expect(observabilityMock.logger.error).toHaveBeenCalledWith(
        `Failure in getting records for table ${'mockCampaignsDynamoRepositoryName'}. Error: ${errorMessage}`
      );
    });
  });

  describe('DeleteCampaignRecord', () => {
    it('should delete record with correct table name and key', async () => {
      // Arrange and Act
      await instance.deleteRecord('DEPT01/CAMP01');

      // Assert
      expect(dynamoMock.calls()).toHaveLength(1);
      const command = dynamoMock.call(0).args[0] as DeleteItemCommand;
      expect(command.input.TableName).toBe('mockCampaignsDynamoRepositoryName');
      expect(command.input.Key).toEqual(marshall({ CompositeID: 'DEPT01/CAMP01' }));
    });

    it('should log error if request fails', async () => {
      // Arrange
      const errorMessage = 'Connection Failure';
      dynamoMock.on(UpdateItemCommand).rejectsOnce(new Error(errorMessage));

      // Act
      await instance.deleteRecord('DEPT01/CAMP01');

      // Assert
      expect(observabilityMock.logger.error).toHaveBeenCalledWith(
        `Failure in deleting record in table: ${'mockCampaignsDynamoRepositoryName'} with key ${'CompositeID'}`
      );
    });
  });
});
