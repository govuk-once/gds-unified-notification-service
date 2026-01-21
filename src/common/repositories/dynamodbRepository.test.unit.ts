import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { BatchWriteItemCommand, DynamoDB, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { MessageRecord } from '@common/models/interfaces/MessageRecord';
import { LambdaSourceEnum } from '@common/models/LambdaSourceEnum';
import { StatusEnum } from '@common/models/StatusEnum';
import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { mockClient } from 'aws-sdk-client-mock';

describe('DynamodbRepository', () => {
  const dynamoMock = mockClient(DynamoDB);
  let repo: DynamodbRepository;
  const tableName = 'testTable';
  const tableKey = 'testKey';

  const info = vi.fn();
  const error = vi.fn();
  const captureAWSv3Client = vi.fn();

  beforeEach(() => {
    dynamoMock.reset();
    repo = new DynamodbRepository(
      tableName,
      tableKey,
      { info, error } as unknown as Logger,
      { captureAWSv3Client } as unknown as Tracer
    );
  });

  describe('CreateRecord', () => {
    it('marshall record should be sent', async () => {
      // Arrange
      const record: MessageRecord = {
        id: '0f80a09a-16dc-4fee-b5e2-090eeb7a4b45',
        status: StatusEnum.PROCESSING,
        src: LambdaSourceEnum.Health,
        createdAt: '2026-01-01T00:00:00Z',
      };

      // Act
      await repo.createRecord<MessageRecord>(record);

      // Assert
      expect(dynamoMock.calls()).toHaveLength(1);
      const command = dynamoMock.call(0).args[0] as PutItemCommand;

      expect(command.input.TableName).toBe(tableName);
      expect(unmarshall(command.input.Item!)).toEqual(record);
    });
  });

  describe('CreateRecordBatch', () => {
    it('should create a PutRequest request out of marshalled record and should be sent with batchWriteItem', async () => {
      // Arrange
      const record: MessageRecord[] = [
        {
          id: '0f80a09a-16dc-4fee-b5e2-090eeb7a4b45',
          status: StatusEnum.PROCESSING,
          src: LambdaSourceEnum.Health,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];

      // Act
      await repo.createRecordBatch<MessageRecord>(record);

      // Assert
      expect(dynamoMock.calls()).toHaveLength(1);
      const command = dynamoMock.call(0).args[0] as BatchWriteItemCommand;
      expect(command.input.RequestItems).toEqual({
        [tableName]: [
          {
            PutRequest: {
              Item: marshall(record[0]),
            },
          },
        ],
      });
    });

    it('should throw an error if an empty list is given', async () => {
      // Arrange
      const record: MessageRecord[] = [];
      const errorMsg = 'To create batch records, array length must be more than 0 and at most 25.';

      // Act
      const result = repo.createRecordBatch<MessageRecord>(record);

      // Assert
      await expect(result).rejects.toThrow(Error(errorMsg));
      expect(error).toBeCalledWith(errorMsg);
    });
  });

  describe('GetRecord', () => {
    it('should return unmarshall data', async () => {
      // Arrange
      const mockGuid = '0f80a09a-16dc-4fee-b5e2-090eeb7a4b45';
      const mockRecord: MessageRecord = {
        id: mockGuid,
        status: StatusEnum.PROCESSING,
        src: LambdaSourceEnum.Health,
        createdAt: '2026-01-01T00:00:00Z',
      };

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall(mockRecord),
      });

      // Act
      const result = await repo.getRecord<MessageRecord>(mockGuid);

      // Assert
      expect(result).toEqual(mockRecord);
    });

    it('if item is not found null should be returned', async () => {
      // Arrange
      const mockGuid = '0f80a09a-16dc-4fee-b5e2-090eeb7a4b46';

      dynamoMock.on(GetItemCommand).resolves({
        Item: undefined,
      });

      // Act
      const result = await repo.getRecord<MessageRecord>(mockGuid);

      // Assert
      expect(result).toBeNull();
    });
  });
});
