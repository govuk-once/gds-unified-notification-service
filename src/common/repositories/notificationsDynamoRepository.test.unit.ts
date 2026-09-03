import { marshall } from '@aws-sdk/util-dynamodb';
import { ParsingFailedError } from '@common/models';
import { IMessageRecord } from '@common/repositories/interfaces';
import { NotificationsDynamoRepository } from '@common/repositories/notificationsDynamoRepository';
import { StringParameters } from '@common/utils';
import {
  iocSpies,
  mockAWSClientsExpectedBehaviour,
  mockIMessageRecord,
  mockIProcessedMessage,
  mockServicesExpectedBehaviour,
} from '@test/mocks';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/util-dynamodb', { spy: true });

vi.mock('@common/services', { spy: true });

describe('NotificationsDynamoRepository', () => {
  let instance: NotificationsDynamoRepository;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, awsClientMocks, serviceMocks } = iocSpies();

  // Test Fixtures
  const message = mockIProcessedMessage();
  const messageRecord = mockIMessageRecord(message);

  beforeEach(async () => {
    // Reset all mock
    vi.resetAllMocks();
    vi.useRealTimers();

    // Mock SSM store and services responses
    mockServicesExpectedBehaviour(serviceMocks);
    mockAWSClientsExpectedBehaviour(awsClientMocks);

    instance = new NotificationsDynamoRepository(
      serviceMocks.configurationServiceMock,
      awsClientMocks.dynamoDBClientMock,
      observabilityMocks
    );
    await instance.initialize();
  });

  describe('initialize', () => {
    it('should call super.initialize with correct parameters and return this', async () => {
      // Arrange
      const superInitialize = vi
        .spyOn(Object.getPrototypeOf(NotificationsDynamoRepository.prototype), 'initialize')
        .mockResolvedValue(undefined);

      // Act
      const result = await instance.initialize();

      // Assert
      expect(superInitialize).toHaveBeenCalledWith(StringParameters.Table.Inbound.Attributes);
      expect(result).toBe(instance);
    });
  });

  describe('CreateRecord', () => {
    const recordBody = {
      NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d1',
      DepartmentID: 'TEST01',
      UserID: 'UserID',
      NotificationTitle: 'Hi there',
      NotificationBody: 'You have a new message in the message center',
      ReceivedDateTime: '202601021513',
      Events: [],
      OrganisationID: 'ORG01',
    };

    it('marshall record should be sent', async () => {
      // Arrange
      vi.useFakeTimers();
      const date = new Date();
      vi.setSystemTime(date);
      const expirationDate = new Date(date.getTime() + 30 * 60 * 60 * 24 * 1000).toISOString();

      // Act
      await instance.createRecord(messageRecord);

      // Assert
      expect(awsClientMocks.dynamoDBClientMock.putItem).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'mockNotificationsDynamoRepositoryName',
          Item: marshall({ ...messageRecord, ExpirationDateTime: expirationDate }, { removeUndefinedValues: true }),
        })
      );
    });

    it('should throw an error if record does not match the message record schema', async () => {
      // Arrange
      const invalidRecord = {
        NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d1',
        DepartmentID: 'TEST01',
        UserID: 'UserID',
        NotificationTitle: 'Hi there',
        NotificationBody: 'You have a new message in the message center',
        Events: [],
      } as unknown as IMessageRecord;

      // Act
      const result = instance.createRecord(invalidRecord);

      // Assert
      await expect(result).rejects.toThrow(
        new ParsingFailedError(['Input to create record does not match the record schema'])
      );
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith(
        'Input to create record does not match the record schema',
        invalidRecord
      );
    });

    it('should log an error if the request fails.', async () => {
      // Arrange
      const record: IMessageRecord = recordBody;
      const error = new Error('Connection Failure');
      awsClientMocks.dynamoDBClientMock.putItem = vi.fn().mockRejectedValueOnce(error);

      // Act
      const result = instance.createRecord(record);

      // Assert
      await expect(result).rejects.toThrow(error);
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith('Failure in creating record table', {
        error: error.message,
        tableName: 'mockNotificationsDynamoRepositoryName',
      });
    });

    it('should calculate TTL for a notification using RequestedDaysToExpire if a record request contains it', async () => {
      // Arrange
      vi.useFakeTimers();
      const date = new Date();
      vi.setSystemTime(date);
      awsClientMocks.dynamoDBClientMock.putItem = vi.fn().mockResolvedValueOnce({
        ConsumedCapacity: {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: 1,
        },
      });

      const record: IMessageRecord = { ...recordBody, RequestedDaysToExpire: 25 };
      const expirationDateTime = new Date(date.getTime() + 25 * 24 * 60 * 60 * 1000).toISOString();

      // Act
      await instance.createRecord(record);

      // Assert
      expect(awsClientMocks.dynamoDBClientMock.putItem).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'mockNotificationsDynamoRepositoryName',
          Item: marshall({ ...record, ExpirationDateTime: expirationDateTime }),
        })
      );
    });
  });

  describe('CreateRecordBatch', () => {
    it('should create a PutRequest request out of marshalled record and should be sent with batchWriteItem', async () => {
      // Arrange
      const record: IMessageRecord[] = [messageRecord];
      awsClientMocks.dynamoDBClientMock.batchWriteItem = vi.fn().mockResolvedValueOnce({
        ConsumedCapacity: [
          {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1,
          },
        ],
      });

      // Act
      await instance.createRecordBatch(record);

      // Assert
      expect(awsClientMocks.dynamoDBClientMock.batchWriteItem).toHaveBeenCalledWith(
        expect.objectContaining({
          RequestItems: {
            mockNotificationsDynamoRepositoryName: [
              {
                PutRequest: {
                  Item: {
                    ...marshall(record[0], { removeUndefinedValues: true }),
                    ExpirationDateTime: { S: expect.any(String) },
                  },
                },
              },
            ],
          },
        })
      );
    });

    it('should log an error if an empty list is given', async () => {
      // Arrange
      const record: IMessageRecord[] = [];

      // Act
      await instance.createRecordBatch(record);

      // Assert
      expect(observabilityMocks.logger.warn).toHaveBeenCalledWith(`Triggered createRecordBatch with an empty array`);
    });

    it('should throw an error if an item in the input array does not match the record schema', async () => {
      // Arrange
      const records = [
        messageRecord,
        {
          ...messageRecord,
          OrganisationID: undefined,
        },
      ] as unknown as IMessageRecord[];

      // Act
      const result = instance.createRecordBatch(records);

      // Assert
      await expect(result).rejects.toThrow(
        new ParsingFailedError(['An item in array to create a batch of records does not match the record schema'])
      );
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith(
        'An item in array to create a batch of records does not match the record schema',
        records[1]
      );
    });

    it('should throw an error if record list is greater than 25', async () => {
      // Arrange
      const record: IMessageRecord[] = [];
      for (let i = 0; i < 27; i++) {
        record.push(messageRecord);
      }
      const error = new Error('To create batch records, array length must be no greater than 25');

      // Act
      const result = instance.createRecordBatch(record);

      // Assert
      await expect(result).rejects.toThrow(error);
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith('Failure in creating records table', {
        tableName: 'mockNotificationsDynamoRepositoryName',
        error: error.message,
      });
    });

    it('should log an error if the request fails', async () => {
      // Arrange
      const record: IMessageRecord[] = [messageRecord];
      const error = new Error('Connection Failure');
      awsClientMocks.dynamoDBClientMock.batchWriteItem = vi.fn().mockRejectedValueOnce(error);

      // Act
      const result = instance.createRecordBatch(record);

      // Assert
      await expect(result).rejects.toThrow(error);
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith('Failure in creating records table', {
        tableName: 'mockNotificationsDynamoRepositoryName',
        error: error.message,
      });
    });
  });

  describe('UpdateItem', () => {
    it('should successful send an update item request to dynamo client.', async () => {
      // Arrange
      const mockUpdatedRecord: Partial<IMessageRecord> = {
        NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d1',
        ProcessedDateTime: '202601021513',
        ExternalUserID: 'External-1234',
      };
      awsClientMocks.dynamoDBClientMock.updateItem = vi.fn().mockResolvedValueOnce({
        ConsumedCapacity: {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: 1,
        },
      });

      // Act
      await instance.updateRecord(mockUpdatedRecord);

      // Assert
      expect(awsClientMocks.dynamoDBClientMock.updateItem).toHaveBeenCalledWith({
        TableName: 'mockNotificationsDynamoRepositoryName',
        Key: marshall({
          ['NotificationID']: mockUpdatedRecord.NotificationID,
        }),
        ExpressionAttributeNames: {
          '#ExternalUserID': 'ExternalUserID',
          '#ProcessedDateTime': 'ProcessedDateTime',
        },
        ExpressionAttributeValues: {
          ':ExternalUserID': {
            S: 'External-1234',
          },
          ':ProcessedDateTime': {
            S: '202601021513',
          },
        },
        UpdateExpression: `set #ProcessedDateTime = :ProcessedDateTime, #ExternalUserID = :ExternalUserID`,
        ReturnConsumedCapacity: 'TOTAL',
      });
    });

    it('should log an error if the request fails', async () => {
      // Arrange
      const error = new Error('Connection Failure');
      awsClientMocks.dynamoDBClientMock.updateItem = vi.fn().mockRejectedValueOnce(error);

      // Act
      const result = instance.updateRecord(messageRecord);

      // Assert
      await expect(result).rejects.toThrow(error);
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith(
        'Failure in updating record table',
        expect.objectContaining({
          tableName: 'mockNotificationsDynamoRepositoryName',
          error: error.message,
        })
      );
    });

    it('should throw an error fields for the items does not match the record schema', async () => {
      // Arrange
      const record = {
        NotificationID: 12345678,
      } as unknown as IMessageRecord;

      // Act
      const result = instance.updateRecord(record);

      // Assert
      await expect(result).rejects.toThrow(
        new ParsingFailedError(['Fields used to update record in table do not match the record schema'])
      );
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith(
        'Fields used to update record in table do not match the record schema',
        record
      );
    });
  });

  describe('GetRecord', () => {
    it('should return unmarshall data', async () => {
      // Arrange
      const notificationID = 'efe72235-d02a-45a9-b9d4-a04ff992fcc3';

      awsClientMocks.dynamoDBClientMock.getItem = vi.fn().mockResolvedValueOnce({
        Item: marshall(messageRecord, { removeUndefinedValues: true }),
      });

      // Act
      const result = await instance.getRecord(notificationID);

      // Assert
      expect(result).toEqual(messageRecord);
    });

    it('if item is not found null should be returned', async () => {
      // Arrange
      const mockNotificationID = '1234';
      awsClientMocks.dynamoDBClientMock.getItem = vi.fn().mockResolvedValueOnce({});

      // Act
      const result = await instance.getRecord(mockNotificationID);

      // Assert
      expect(result).toBeNull();
    });

    it('should log an error if the request fails', async () => {
      // Arrange
      const mockNotificationID = '1234';
      const error = new Error('Connection Failure');
      awsClientMocks.dynamoDBClientMock.getItem = vi.fn().mockRejectedValueOnce(error);

      // Act
      const result = instance.getRecord(mockNotificationID);

      // Assert
      await expect(result).rejects.toThrow(error);
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith('Failure in getting record for table', {
        tableName: 'mockNotificationsDynamoRepositoryName',
        error: error.message,
      });
    });

    it('should throw an error if the record retrieved from the table does not match the record schema', async () => {
      // Arrange
      const mockInvalidRecord = {
        NotificationID: 12345678,
      } as unknown as IMessageRecord;
      awsClientMocks.dynamoDBClientMock.getItem = vi.fn().mockResolvedValueOnce({
        Item: marshall(mockInvalidRecord),
      });
      const keyValue = '111111111';

      // Act
      const result = instance.getRecord(keyValue);

      // Assert
      await expect(result).rejects.toThrow(
        new ParsingFailedError([
          'Record in table failed to parse to record schema',
          'Invalid input: expected string, received number → at NotificationID.',
          'Invalid input: expected string, received undefined → at OrganisationID.',
          'Invalid input: expected string, received undefined → at NotificationTitle.',
          'Invalid input: expected string, received undefined → at NotificationBody.',
          'Invalid input: expected array, received undefined → at Events.',
        ])
      );
      expect(observabilityMocks.logger.error).toHaveBeenCalledWith('Record in table failed to parse to record schema', {
        tableName: 'mockNotificationsDynamoRepositoryName',
        key: 'NotificationID',
        value: keyValue,
      });
    });
  });
});
