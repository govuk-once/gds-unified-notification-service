/* eslint-disable @typescript-eslint/unbound-method */
import {
  BatchWriteItemCommand,
  DynamoDB,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { InboundDynamoRepository } from '@common/repositories/inboundDynamoRepository';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import { mockClient } from 'aws-sdk-client-mock';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services', { spy: true });

const mockInboundTableName = 'mockInboundTableName';
const mockInboundTableKey = 'NotificationID';

describe('InboundDynamoRepository', () => {
  let inboundDynamoRepo: InboundDynamoRepository;

  const observabilityMock = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMock);
  const dynamoMock = mockClient(DynamoDB);

  beforeEach(async () => {
    vi.resetAllMocks();
    dynamoMock.reset();

    serviceMocks.configurationServiceMock.getParameter = vi
      .fn()
      .mockResolvedValueOnce(mockInboundTableName)
      .mockResolvedValueOnce(mockInboundTableKey);

    inboundDynamoRepo = new InboundDynamoRepository(serviceMocks.configurationServiceMock, observabilityMock);
    await inboundDynamoRepo.initialize();
  });

  describe('initialize', () => {
    it('should throw an error if table name is undefined', async () => {
      // Arrange
      serviceMocks.configurationServiceMock.getParameter = vi.fn().mockResolvedValueOnce(undefined);
      inboundDynamoRepo = new InboundDynamoRepository(serviceMocks.configurationServiceMock, observabilityMock);

      // Act
      const result = inboundDynamoRepo.initialize();

      // Assert
      await expect(result).rejects.toThrow(new Error('Failed to fetch table name'));
    });

    it('should throw an error if table key is undefined', async () => {
      // Arrange
      serviceMocks.configurationServiceMock.getParameter = vi
        .fn()
        .mockResolvedValueOnce('mockTableName')
        .mockResolvedValueOnce(undefined);
      inboundDynamoRepo = new InboundDynamoRepository(serviceMocks.configurationServiceMock, observabilityMock);

      // Act
      const result = inboundDynamoRepo.initialize();

      // Assert
      await expect(result).rejects.toThrow(new Error('Failed to fetch table key'));
    });
  });

  describe('CreateRecord', () => {
    const recordBody = {
      NotificationID: '1234',
      DepartmentID: 'TEST01',
      UserID: 'UserID',
      NotificationTitle: 'Hi there',
      NotificationBody: 'You have a new message in the message center',
      ReceivedDateTime: '202601021513',
    };

    it('marshall record should be sent', async () => {
      // Arrange
      const record: IMessageRecord = recordBody;

      // Act
      await inboundDynamoRepo.createRecord(record);

      // Assert
      expect(dynamoMock.calls()).toHaveLength(1);
      const command = dynamoMock.call(0).args[0] as PutItemCommand;

      expect(command.input.TableName).toBe(mockInboundTableName);
      expect(unmarshall(command.input.Item!)).toEqual(record);
    });

    it('should log an error if the request fails.', async () => {
      // Arrange
      const record: IMessageRecord = recordBody;
      const errorMsg = 'Connection Failure';
      dynamoMock.on(PutItemCommand).rejectsOnce(new Error(errorMsg));

      // Act
      await inboundDynamoRepo.createRecord(record);

      // Assert
      expect(observabilityMock.logger.error).toHaveBeenCalledWith(
        `Failure in creating record table: ${mockInboundTableName}. Error: ${errorMsg}`
      );
    });
  });

  describe('CreateRecordBatch', () => {
    const recordBody = {
      NotificationID: '1234',
      DepartmentID: 'TEST01',
      UserID: 'UserID',
      NotificationTitle: 'Hi there',
      NotificationBody: 'You have a new message in the message center',
      ReceivedDateTime: '202601021513',
    };

    it('should create a PutRequest request out of marshalled record and should be sent with batchWriteItem', async () => {
      // Arrange
      const record: IMessageRecord[] = [recordBody];

      // Act
      await inboundDynamoRepo.createRecordBatch(record);

      // Assert
      expect(dynamoMock.calls()).toHaveLength(1);
      const command = dynamoMock.call(0).args[0] as BatchWriteItemCommand;
      expect(command.input.RequestItems).toEqual({
        [mockInboundTableName]: [
          {
            PutRequest: {
              Item: marshall(record[0]),
            },
          },
        ],
      });
    });

    it('should log an error if an empty list is given', async () => {
      // Arrange
      const record: IMessageRecord[] = [];

      // Act
      await inboundDynamoRepo.createRecordBatch(record);

      // Assert
      expect(observabilityMock.logger.warn).toHaveBeenCalledWith(`Triggered createRecordBatch with an empty array`);
    });

    it('should throw an error if record list is greater than 25.', async () => {
      // Arrange
      const record: IMessageRecord[] = [];
      for (let i = 0; i < 27; i++) {
        record.push(recordBody);
      }

      // Act
      const result = await inboundDynamoRepo.createRecordBatch(record);

      // Assert
      expect(observabilityMock.logger.error).toHaveBeenCalledWith(
        'Failure in creating records table: mockInboundTableName. Error: To create batch records, array length must be no greater than 25.'
      );
    });

    it('should log an error if the request fails', async () => {
      // Arrange
      const record: IMessageRecord[] = [recordBody];
      const errorMsg = 'Connection Failure';
      dynamoMock.on(BatchWriteItemCommand).rejectsOnce(new Error(errorMsg));

      // Act
      await inboundDynamoRepo.createRecordBatch(record);

      // Assert
      expect(observabilityMock.logger.error).toHaveBeenCalledWith(
        `Failure in creating records table: ${mockInboundTableName}. Error: ${errorMsg}`
      );
    });
  });

  describe('UpdateItem', () => {
    it('should successful send an update item request to dynamo client.', async () => {
      // Arrange
      const mockUpdatedRecord: Partial<IMessageRecord> = {
        NotificationID: '1234',
        ProcessedDateTime: '202601021513',
        ExternalUserID: 'External-1234',
      };

      // Act
      await inboundDynamoRepo.updateRecord(mockUpdatedRecord);

      // Assert
      expect(dynamoMock.calls()).toHaveLength(1);
      const command = dynamoMock.call(0).args[0] as UpdateItemCommand;
      expect(command.input).toEqual({
        TableName: mockInboundTableName,
        Key: marshall({
          [mockInboundTableKey]: mockUpdatedRecord.NotificationID,
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
      });
    });

    it('should log an error if the request fails', async () => {
      // Arrange
      const record: Partial<IMessageRecord> = {
        NotificationID: '1234',
        ProcessedDateTime: '202601021513',
        ExternalUserID: 'External-1234',
      };
      const errorMsg = 'Connection Failure';
      dynamoMock.on(UpdateItemCommand).rejectsOnce(new Error(errorMsg));

      // Act
      await inboundDynamoRepo.updateRecord(record);

      // Assert
      expect(observabilityMock.logger.error).toHaveBeenCalledWith(
        `Failure in updating record table: ${mockInboundTableName}. Error: ${errorMsg}`,
        expect.any(Object)
      );
    });
  });

  describe('GetRecord', () => {
    it('should return unmarshall data', async () => {
      // Arrange
      const mockNotificationID = '1234';
      const mockRecord: IMessageRecord = {
        NotificationID: '1234',
        DepartmentID: 'DVLA01',
        UserID: 'UserID',
        MessageTitle: 'You have a new Message',
        MessageBody: 'Open Notification Centre to read your notifications',
        NotificationTitle: 'You have a new medical driving license',
        NotificationBody: 'The DVLA has issued you a new license.',
        ReceivedDateTime: '202601021513',
      };

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall(mockRecord),
      });

      // Act
      const result = await inboundDynamoRepo.getRecord(mockNotificationID);

      // Assert
      expect(result).toEqual(mockRecord);
    });

    it('if item is not found null should be returned', async () => {
      // Arrange
      const mockNotificationID = '1234';

      dynamoMock.on(GetItemCommand).resolves({
        Item: undefined,
      });

      // Act
      const result = await inboundDynamoRepo.getRecord(mockNotificationID);

      // Assert
      expect(result).toBeNull();
    });

    it('should log an error if the request fails', async () => {
      // Arrange
      const mockNotificationID = '1234';
      const errorMsg = 'Connection Failure';
      dynamoMock.on(GetItemCommand).rejectsOnce(new Error(errorMsg));

      // Act
      await inboundDynamoRepo.getRecord(mockNotificationID);

      // Assert
      expect(observabilityMock.logger.error).toHaveBeenCalledWith(
        `Failure in getting record for table: ${mockInboundTableName}. Error: ${errorMsg}`
      );
    });
  });
});
