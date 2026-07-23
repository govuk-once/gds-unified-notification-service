import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { GroupStoreDynamoRepository } from '@common/repositories/groupStoreDynamoRepository';
import { IGroupStoreRecord } from '@common/repositories/interfaces';
import { StringParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { ISubscriptionGroup } from '@project/lambdas';
import { mockClient } from 'aws-sdk-client-mock';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services', { spy: true });

describe('SubscriptionsDynamoRepository', () => {
  let instance: GroupStoreDynamoRepository;

  // Initialize the mock service and repository layers
  const observabilityMock = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMock);
  const dynamoMock = mockClient(DynamoDB);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  const mockPushID = '2536bd9b-611b-453c-ba3d-e34783e4c9d1';
  const mockSubscriptionID = 'd63d1fea-5731-4350-a54f-2e0ddaeae943';

  beforeEach(async () => {
    // Reset all mock
    vi.resetAllMocks();
    dynamoMock.reset();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    instance = new GroupStoreDynamoRepository(serviceMocks.configurationServiceMock, observabilityMock);
    await instance.initialize();
  });

  describe('initialize', () => {
    it('should call super.initialize with correct parameters and return this', async () => {
      // Arrange
      const superInitialize = vi
        .spyOn(Object.getPrototypeOf(GroupStoreDynamoRepository.prototype), 'initialize')
        .mockResolvedValue(undefined);

      // Act
      const result = await instance.initialize();

      // Assert
      expect(superInitialize).toHaveBeenCalledWith(StringParameters.Table.Subscriptions.Attributes);
      expect(result).toBe(instance);
    });
  });

  describe('addSubscription', () => {
    const mockSubscriptionGroup: ISubscriptionGroup = {
      namespace: 'travel',
      subscription: 'france',
      subgroup: 'immediate',
    };

    it('should create a subscription record using the namespace, subscription, and subgroup', async () => {
      // Arrange
      const mockGroupStoreRecord: IGroupStoreRecord = {
        PushID: mockPushID,
        SubscriptionID: mockSubscriptionID,
        CompositeID: `${mockSubscriptionGroup.namespace}/${mockSubscriptionGroup.subscription}/${mockSubscriptionGroup.subgroup}`,
        Namespace: mockSubscriptionGroup.namespace,
        Subscription: mockSubscriptionGroup.subscription,
        Subgroup: mockSubscriptionGroup.subgroup,
      };
      instance.createRecord = vi.fn().mockResolvedValueOnce(undefined);

      // Act
      await instance.addSubscription(mockSubscriptionID, mockPushID, mockSubscriptionGroup);

      // Assert
      expect(instance.createRecord).toHaveBeenCalledWith(mockGroupStoreRecord);
    });
  });

  describe('getSubscriptions', () => {
    const mockSubscriptionGroup: ISubscriptionGroup = {
      namespace: 'travel',
      subscription: 'france',
      subgroup: 'immediate',
    };

    it('should fetch a user subscriptions based on their pushID', async () => {
      // Arrange
      const mockGroupStoreRecord: IGroupStoreRecord[] = [
        {
          PushID: mockPushID,
          SubscriptionID: mockSubscriptionID,
          CompositeID: `${mockSubscriptionGroup.namespace}/${mockSubscriptionGroup.subscription}/${mockSubscriptionGroup.subgroup}`,
          Namespace: mockSubscriptionGroup.namespace,
          Subscription: mockSubscriptionGroup.subscription,
          Subgroup: mockSubscriptionGroup.subgroup,
        },
      ];
      instance.getRecords = vi.fn().mockResolvedValueOnce(mockGroupStoreRecord);

      // Act
      const result = await instance.getSubscriptions(mockPushID);

      // Assert
      expect(result).toEqual([mockSubscriptionGroup]);
    });

    it('should return an empty array if a user has no subscriptions', async () => {
      // Arrange
      instance.getRecords = vi.fn().mockResolvedValueOnce(null);

      // Act
      const result = await instance.getSubscriptions(mockPushID);

      // Assert
      expect(result).toEqual([]);
    });
  });
});
