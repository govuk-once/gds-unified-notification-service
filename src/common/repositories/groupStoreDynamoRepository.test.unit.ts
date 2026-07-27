import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { GroupActionEnum } from '@common/models';
import { GroupStoreDynamoRepository } from '@common/repositories/groupStoreDynamoRepository';
import { IGroupStoreRecord } from '@common/repositories/interfaces';
import { StringParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { IGroup, IModifyGroups } from '@project/lambdas';
import { mockClient } from 'aws-sdk-client-mock';

vi.mock('uuid');
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
  const mockGroupID = 'd63d1fea-5731-4350-a54f-2e0ddaeae943';

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
      expect(superInitialize).toHaveBeenCalledWith(StringParameters.Table.GroupStore.Attributes);
      expect(result).toBe(instance);
    });
  });

  describe('joinGroups', () => {
    vi.mock('uuid', () => ({
      uuid: () => mockGroupID,
    }));
    const mockJoinGroups: IModifyGroups = [
      {
        Namespace: 'travel',
        Group: 'france',
        Subgroup: 'immediate',
        Action: GroupActionEnum.JOIN,
      },
    ];

    it('should add a user to a group using the namespace, group, and subgroup', async () => {
      // Arrange

      const mockGroupStoreRecord: IGroupStoreRecord[] = [
        {
          PushID: mockPushID,
          GroupID: mockGroupID,
          CompositeID: `${mockJoinGroups[0].Namespace}/${mockJoinGroups[0].Group}/${mockJoinGroups[0].Group}`,
          Namespace: mockJoinGroups[0].Namespace,
          Group: mockJoinGroups[0].Group,
          Subgroup: mockJoinGroups[0].Group,
        },
      ];
      instance.createRecordBatch = vi.fn().mockResolvedValueOnce(undefined);

      // Act
      await instance.joinGroups(mockPushID, mockJoinGroups);

      // Assert
      expect(instance.createRecordBatch).toHaveBeenCalledWith(mockGroupStoreRecord);
    });
  });

  describe('getUsersGroups', () => {
    const mockGroup: IGroup = {
      groupID: mockGroupID,
      namespace: 'travel',
      group: 'france',
      subgroup: 'immediate',
    };

    it('should fetch a user groups based on their pushID', async () => {
      // Arrange
      const mockGroupStoreRecord: IGroupStoreRecord[] = [
        {
          PushID: mockPushID,
          GroupID: mockGroupID,
          CompositeID: `${mockGroup.namespace}/${mockGroup.group}/${mockGroup.subgroup}`,
          Namespace: mockGroup.namespace,
          Group: mockGroup.group,
          Subgroup: mockGroup.subgroup,
        },
      ];
      instance.getRecords = vi.fn().mockResolvedValueOnce(mockGroupStoreRecord);

      // Act
      const result = await instance.getUsersGroups(mockPushID);

      // Assert
      expect(result).toEqual([mockGroup]);
    });

    it('should return an empty array if a user has no groups', async () => {
      // Arrange
      instance.getRecords = vi.fn().mockResolvedValueOnce(null);

      // Act
      const result = await instance.getUsersGroups(mockPushID);

      // Assert
      expect(result).toEqual([]);
    });
  });
});
