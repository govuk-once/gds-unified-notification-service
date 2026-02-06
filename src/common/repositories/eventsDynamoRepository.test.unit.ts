/* eslint-disable @typescript-eslint/unbound-method */
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamodbRepository } from '@common/repositories/dynamodbRepository';
import { EventsDynamoRepository } from '@common/repositories/eventsDynamoRepository';
import { StringParameters } from '@common/utils';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import { mockClient } from 'aws-sdk-client-mock';
import { Mocked } from 'vitest';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services', { spy: true });

const mockInboundTableName = 'mockEventTableName';
const mockInboundTableAttributes = {
  attributes: ['EventID', 'EventDateTime', 'NotificationID', 'DepartmentID'],
  hashKey: 'EventID',
  rangeKey: 'DepartmentID',
};

describe('EventsDynamoRepository', () => {
  let instance: EventsDynamoRepository;

  const observabilityMock = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMock);
  const dynamoMock = mockClient(DynamoDB);

  beforeEach(() => {
    dynamoMock.reset();

    serviceMocks.configurationServiceMock.getParameter = vi.fn().mockResolvedValueOnce(mockInboundTableName);
    serviceMocks.configurationServiceMock.getParameterAsType = vi
      .fn()
      .mockResolvedValueOnce(mockInboundTableAttributes);
    instance = new EventsDynamoRepository(serviceMocks.configurationServiceMock, observabilityMock);
  });

  describe('initialize', () => {
    it('should call super.initialize with correct parameters and return this', async () => {
      // Arrange
      const dynamodbRepositoryMock = Object.getPrototypeOf(EventsDynamoRepository.prototype) as Mocked<
        DynamodbRepository<IMessageRecord>
      >;
      dynamodbRepositoryMock.initialize = vi.fn().mockResolvedValue(undefined);

      // Act
      const result = await instance.initialize();

      // Assert
      expect(dynamodbRepositoryMock.initialize).toHaveBeenCalledWith(
        StringParameters.Table.Events.KeyAttributes,
        StringParameters.Table.Events.Name
      );
      expect(result).toBe(instance);
    });
  });
});
