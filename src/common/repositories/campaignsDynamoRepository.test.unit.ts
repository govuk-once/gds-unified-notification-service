import { marshall } from '@aws-sdk/util-dynamodb';
import { ParsingFailedError } from '@common/models/Errors/InternalServerError';
import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { CampaignsDynamoRepository } from '@common/repositories/campaignsDynamoRepository';
import { ICampaignRecord } from '@common/repositories/interfaces/ICampaignRecord';
import { StringParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { awsClientSpies, observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/util-dynamodb', { spy: true });
vi.mock('@common/services', { spy: true });

describe('campaignDynamoRepository', () => {
  let instance: CampaignsDynamoRepository;

  // Initialize the mock service and repository layers
  const observabilityMock = observabilitySpies();
  const clientMocks = awsClientSpies();
  const serviceMocks = ServiceSpies(observabilityMock, clientMocks);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  beforeEach(async () => {
    vi.resetAllMocks();

    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    instance = new CampaignsDynamoRepository(
      serviceMocks.configurationServiceMock,
      clientMocks.dynamoDBClientMock,
      observabilityMock
    );

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

  describe('GetCampaignRecord', () => {
    it('should get record with correct table name', async () => {
      // Arrange
      const mockRecord: ICampaignRecord = { CompositeID: 'DEPT01/CAMP01' };
      clientMocks.dynamoDBClientMock.getItem = vi.fn().mockResolvedValueOnce({ Item: marshall(mockRecord) });

      // Act
      const result = await instance.getRecord('DEPT01/CAMP01');

      // Assert
      expect(result).toEqual(mockRecord);
    });

    it('should return null if item is not found', async () => {
      // Arrange
      clientMocks.dynamoDBClientMock.getItem = vi.fn().mockResolvedValueOnce({});

      // Act
      const result = await instance.getRecord('DEPT01/CAMP01');

      // Assert
      expect(result).toBeNull();
    });

    it('should log error if request fails', async () => {
      // Arrange
      const error = new Error('Connection Failure');
      clientMocks.dynamoDBClientMock.getItem = vi.fn().mockRejectedValueOnce(error);

      // Act
      const result = instance.getRecord('DEPT01/CAMP01');

      // Assert
      await expect(result).rejects.toThrow(error);
      expect(observabilityMock.logger.error).toHaveBeenCalledWith('Failure in getting record for table', {
        tableName: 'mockCampaignsDynamoRepositoryName',
        error: error.message,
      });
    });

    it('should throw an error if the record in the table does not match the campaign record schema', async () => {
      // Arrange
      const compositeID = 'DEPT01/CAMP01';
      const mockInvalidCampaignRecord = {
        CompositeID: 12345678,
      } as unknown as ICampaignRecord;
      clientMocks.dynamoDBClientMock.getItem = vi.fn().mockResolvedValueOnce({
        Item: marshall(mockInvalidCampaignRecord),
      });

      // Act
      const result = instance.getRecord(compositeID);

      // Assert
      await expect(result).rejects.toThrow(
        new ParsingFailedError([
          'Record in table failed to parse to record schema',
          'Invalid input: expected string, received number → at CompositeID.',
        ])
      );
      expect(observabilityMock.logger.error).toHaveBeenCalledWith('Record in table failed to parse to record schema', {
        tableName: 'mockCampaignsDynamoRepositoryName',
        key: 'CompositeID',
        value: compositeID,
      });
    });
  });

  describe('GetCampaignRecords', () => {
    it('should get record with correct table name', async () => {
      // Arrange
      const mockRecords: ICampaignRecord[] = [{ CompositeID: 'DEPT01/CAMP01' }, { CompositeID: 'DEPT01/CAMP01' }];
      clientMocks.dynamoDBClientMock.scan = vi
        .fn()
        .mockResolvedValueOnce({ Items: mockRecords.map((record) => marshall(record)) });

      // Act
      const result = await instance.getRecords();

      // Assert
      expect(result).toEqual(mockRecords);
    });

    it('should return empty array if no item are found', async () => {
      // Arrange
      clientMocks.dynamoDBClientMock.scan = vi.fn().mockResolvedValueOnce({ Items: [] });

      // Act
      const result = await instance.getRecords();

      // Assert
      expect(result).toEqual([]);
    });

    it('should log error if request fails', async () => {
      // Arrange
      const error = new Error('Connection Failure');
      clientMocks.dynamoDBClientMock.scan = vi.fn().mockRejectedValueOnce(error);

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

      clientMocks.dynamoDBClientMock.updateItem = vi.fn().mockResolvedValueOnce({
        ConsumedCapacity: {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: 1,
        },
      });

      // Act
      await instance.incrementCampaigns(campaignID, organisationID, departmentID, event);

      // Assert
      expect(clientMocks.dynamoDBClientMock.updateItem).toHaveBeenCalledTimes(1);
      expect(clientMocks.dynamoDBClientMock.updateItem).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'mockCampaignsDynamoRepositoryName',
          Key: marshall({ CompositeID: 'ORG01/DEPT01/CAMP01' }),
          ExpressionAttributeNames: { '#counter': event },
          ExpressionAttributeValues: {
            ':incr': { N: '1' },
            ':start_value': { N: '0' },
          },
          UpdateExpression: `set #counter = if_not_exists(#counter, :start_value) + :incr`,
        })
      );
    });

    it('should increment record with an organisation/campaign composite key when department is absent', async () => {
      // Arrange
      const campaignID = 'CAMP01';
      const organisationID = 'ORG01';
      const event = NotificationStateEnum.VALIDATED;

      clientMocks.dynamoDBClientMock.updateItem = vi.fn().mockResolvedValueOnce({
        ConsumedCapacity: {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: 1,
        },
      });

      // Act
      await instance.incrementCampaigns(campaignID, organisationID, undefined, event);

      // Assert
      expect(clientMocks.dynamoDBClientMock.updateItem).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: marshall({ CompositeID: 'ORG01/CAMP01' }),
        })
      );
    });
  });
});
