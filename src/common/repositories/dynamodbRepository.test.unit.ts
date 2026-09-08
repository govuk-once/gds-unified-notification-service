import { marshall } from '@aws-sdk/util-dynamodb';
import { ServiceMisconfigurationError } from '@common/models/Errors/InternalServerError';
import { GroupStoreDynamoRepository } from '@common/repositories/groupStoreDynamoRepository';
import { NotificationsDynamoRepository } from '@common/repositories/notificationsDynamoRepository';
import {
  iocSpies,
  mockAWSClientsExpectedBehaviour,
  mockIMessageRecord,
  mockIProcessedMessage,
  mockServicesExpectedBehaviour,
} from '@test/mocks';

// The base class is abstract which makes it hard to test it alone.
// Creates two classes that implementes this abstract class:
// 1. NotificationDynamoRepository (no sort key)
// 2. GroupStoreDynamoRepository (with sort key)

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/util-dynamodb', { spy: true });

vi.mock('@common/services', { spy: true });
describe('DynamodbRepository', () => {
  let instance: NotificationsDynamoRepository;
  let groupStoreInstance: GroupStoreDynamoRepository;

  const updateResponse = {
    ConsumedCapacity: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: 1,
    },
  };
  const messageRecord = mockIMessageRecord(mockIProcessedMessage());

  // Initialise mock services
  const { observabilityMocks, awsClientMocks, serviceMocks } = iocSpies();

  beforeEach(async () => {
    vi.resetAllMocks();

    // Mock SSM store and service responses
    mockServicesExpectedBehaviour(serviceMocks);
    mockAWSClientsExpectedBehaviour(awsClientMocks);

    instance = new NotificationsDynamoRepository(
      serviceMocks.configurationServiceMock,
      awsClientMocks.dynamoDBClientMock,
      observabilityMocks
    );
    await instance.initialize();

    groupStoreInstance = new GroupStoreDynamoRepository(
      serviceMocks.configurationServiceMock,
      awsClientMocks.dynamoDBClientMock,
      observabilityMocks
    );
    await groupStoreInstance.initialize();
  });

  describe('appendToList', () => {
    const listKey = 'Events';
    const item = [{ Event: 'SENT' }];
    it('should update the record using list_append expression', async () => {
      // Arrange
      awsClientMocks.dynamoDBClientMock.updateItem = vi.fn().mockResolvedValueOnce(updateResponse);

      // Act
      await instance.appendToList(messageRecord.NotificationID, listKey, item);

      // Assert
      expect(awsClientMocks.dynamoDBClientMock.updateItem).toHaveBeenCalledExactlyOnceWith({
        TableName: 'mockNotificationsDynamoRepositoryName',
        Key: marshall({ NotificationID: messageRecord.NotificationID }),
        UpdateExpression: 'SET #attr = list_append(#attr, :value)',
        ExpressionAttributeNames: { '#attr': listKey },
        ExpressionAttributeValues: marshall({ ':value': item }),
      });
    });

    it('should log and throw an error if the request fails', async () => {
      // Arrange
      const error = new Error('Connection Failure');
      awsClientMocks.dynamoDBClientMock.updateItem = vi.fn().mockRejectedValueOnce(error);

      //Act
      const result = instance.appendToList(messageRecord.NotificationID, listKey, item);

      // Assert
      await expect(result).rejects.toThrow(error);
      expect(observabilityMocks.logger.error).toHaveBeenCalledExactlyOnceWith('Failure in updating record table', {
        tableName: 'mockNotificationsDynamoRepositoryName',
        error: error.message,
        params: {
          TableName: 'mockNotificationsDynamoRepositoryName',
          Key: marshall({ NotificationID: messageRecord.NotificationID }),
          UpdateExpression: 'SET #attr = list_append(#attr, :value)',
          ExpressionAttributeNames: { '#attr': listKey },
          ExpressionAttributeValues: marshall({ ':value': item }),
        },
        listKey: listKey,
        item: item,
      });
    });
  });

  describe('deleteRecord', () => {
    const notificaionID = messageRecord.NotificationID;
    const groupID = 'groupID';

    it('should call deleteItem with just the parition key when no sort key is configured', async () => {
      // Arrange
      awsClientMocks.dynamoDBClientMock.deleteItem = vi.fn().mockResolvedValueOnce({});

      // Act
      await instance.deleteRecord(notificaionID);

      // Assert
      expect(awsClientMocks.dynamoDBClientMock.deleteItem).toHaveBeenCalledExactlyOnceWith({
        TableName: 'mockNotificationsDynamoRepositoryName',
        Key: marshall({ NotificationID: notificaionID }),
        ReturnConsumedCapacity: 'TOTAL',
      });
    });

    it('should throw ServiceMisconfigurationError when a sort key is provided for a table with no sort key', async () => {
      // Arrange
      awsClientMocks.dynamoDBClientMock.deleteItem = vi.fn().mockResolvedValueOnce({});

      // Act
      const result = instance.deleteRecord(notificaionID, 'unexpected-sort-key');

      // Assert
      await expect(result).rejects.toThrow(
        new ServiceMisconfigurationError(['A sort key value has been used for a table with no sort key'])
      );
      expect(awsClientMocks.dynamoDBClientMock.deleteItem).not.toHaveBeenCalledOnce();
    });

    it('should throw ServiceMisconfigurationError when the table requires a sort key but none is provided', async () => {
      // Arrange
      awsClientMocks.dynamoDBClientMock.deleteItem = vi.fn().mockResolvedValueOnce({});

      // Act
      const result = groupStoreInstance.deleteRecord(notificaionID);

      // Assert
      await expect(result).rejects.toThrow(
        new ServiceMisconfigurationError(['Table requires a sort key to delete record, but none was provided'])
      );
      expect(awsClientMocks.dynamoDBClientMock.deleteItem).not.toHaveBeenCalledOnce();
    });

    it('should include the partition key and sort key when thable has a sort key', async () => {
      // Arrange
      awsClientMocks.dynamoDBClientMock.deleteItem = vi.fn().mockResolvedValueOnce({});

      // Act
      await groupStoreInstance.deleteRecord(notificaionID, groupID);

      // Assert
      expect(awsClientMocks.dynamoDBClientMock.deleteItem).toHaveBeenCalledExactlyOnceWith({
        TableName: 'mockGroupStoreDynamoRepositoryName',
        Key: marshall({ GroupID: notificaionID, PushID: groupID }),
        ReturnConsumedCapacity: 'TOTAL',
      });
    });

    it('should log and rethrow an error if the request fails', async () => {
      // Arrange
      const error = new Error('Connection failure');
      awsClientMocks.dynamoDBClientMock.deleteItem = vi.fn().mockRejectedValueOnce(error);

      // Act
      const result = instance.deleteRecord(notificaionID);

      // Assert
      await expect(result).rejects.toThrow(error);
      expect(observabilityMocks.logger.error).toHaveBeenCalledExactlyOnceWith('Failure in deleting record in table', {
        tableName: 'mockNotificationsDynamoRepositoryName',
        error: error.message,
        key: 'NotificationID',
      });
    });
  });

  describe('getRecordsQuery', () => {
    const messageRecord = mockIMessageRecord(mockIProcessedMessage());
    const filter = { field: 'NotificationID', value: '123' };

    it('should query with a key condition expression when a filter is provided', async () => {
      // Arrange
      awsClientMocks.dynamoDBClientMock.query = vi
        .fn()
        .mockResolvedValueOnce({ Items: [marshall(messageRecord, { removeUndefinedValues: true })] });

      // Act
      const result = await instance.getRecordsQuery(filter);

      // Assert
      expect(awsClientMocks.dynamoDBClientMock.query).toHaveBeenCalledExactlyOnceWith({
        TableName: 'mockNotificationsDynamoRepositoryName',
        KeyConditionExpression: 'NotificationID = :filterValue',
        ExpressionAttributeValues: marshall({ ':filterValue': filter.value }),
        IndexName: undefined,
        ReturnConsumedCapacity: 'TOTAL',
      });
      expect(result).toEqual([messageRecord]);
    });

    it('should return an empty array when no items are found', async () => {
      // Arrange
      awsClientMocks.dynamoDBClientMock.query = vi.fn().mockResolvedValueOnce({ Items: [] });

      // Act
      const result = await instance.getRecordsQuery(filter);

      // Assert
      expect(result).toEqual([]);
    });
  });

  it('should log and rethrow an error if the request fails', async () => {
    // Arrange
    const error = new Error('Connection failure');
    awsClientMocks.dynamoDBClientMock.query = vi.fn().mockRejectedValueOnce(error);

    // Act
    const result = instance.getRecordsQuery({ field: 'NotificationID', value: '123' });

    // Assert
    await expect(result).rejects.toThrow(error);
    expect(observabilityMocks.logger.error).toHaveBeenCalledExactlyOnceWith(
      'Failure in getting records (query) for table',
      {
        tableName: 'mockNotificationsDynamoRepositoryName',
        error: error.message,
      }
    );
  });
});
