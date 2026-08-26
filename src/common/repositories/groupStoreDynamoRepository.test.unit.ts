import { GroupStoreDynamoRepository } from '@common/repositories/groupStoreDynamoRepository';
import { IGroupStoreRecord } from '@common/repositories/interfaces';
import { StringParameters } from '@common/utils';
import { GroupActionEnum, IGroups, IModifyGroups } from '@project/lambdas';
import { iocSpies, mockDefaultConfig, mockGetParameterImplementation } from '@test/mocks';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/util-dynamodb', { spy: true });

vi.mock('@common/services', { spy: true });

const mockGroupID = 'd63d1fea-5731-4350-a54f-2e0ddaeae943';
vi.mock('uuid', () => ({
  v4: () => mockGroupID,
}));

describe('GroupStoreDynamoRepository', () => {
  let instance: GroupStoreDynamoRepository;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, awsClientMocks, serviceMocks } = iocSpies();

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  const mockPushID = '2536bd9b-611b-453c-ba3d-e34783e4c9d1';
  const mockGroup: IGroups = {
    GroupID: mockGroupID,
    CompositeID: `travel/france/IMMEDIATE`,
    Namespace: 'travel',
    Group: 'france',
    Subgroup: 'IMMEDIATE',
  };

  beforeEach(async () => {
    // Reset all mock
    vi.resetAllMocks();
    vi.useRealTimers();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    instance = new GroupStoreDynamoRepository(
      serviceMocks.configurationServiceMock,
      awsClientMocks.dynamoDBClientMock,
      observabilityMocks
    );
    instance.getRecordsQuery = vi.fn().mockResolvedValueOnce(undefined);
    instance.deleteRecord = vi.fn().mockResolvedValueOnce(undefined);
    instance.createRecordBatch = vi.fn().mockResolvedValueOnce(undefined);
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

  describe('getUsersGroups', () => {
    it('should fetch a user groups based on their pushID', async () => {
      // Arrange
      vi.useFakeTimers();
      const date = new Date();
      vi.setSystemTime(new Date());
      const mockGroupStoreRecord: IGroupStoreRecord[] = [
        {
          PushID: mockPushID,
          GroupID: mockGroupID,
          CompositeID: mockGroup.CompositeID,
          Date: date.toISOString(),
          Namespace: mockGroup.Namespace,
          Group: mockGroup.Group,
          Subgroup: mockGroup.Subgroup,
        },
      ];
      instance.getRecordsQuery = vi.fn().mockResolvedValueOnce(mockGroupStoreRecord);

      // Act
      const result = await instance.getUsersGroups(mockPushID);

      // Assert
      expect(result).toEqual([mockGroup]);
    });

    it('should return an empty array if a user has no groups', async () => {
      // Arrange
      instance.getRecordsQuery = vi.fn().mockResolvedValueOnce(null);

      // Act
      const result = await instance.getUsersGroups(mockPushID);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('getUsersInGroup', () => {
    it('should fetch a list of user in a group based on its namespace, group, and subgroup', async () => {
      // Arrange
      vi.useFakeTimers();
      const date = new Date();
      vi.setSystemTime(new Date());
      const mockGroupStoreRecord: IGroupStoreRecord[] = [
        {
          PushID: mockPushID,
          GroupID: mockGroupID,
          CompositeID: mockGroup.CompositeID,
          Date: date.toISOString(),
          Namespace: mockGroup.Namespace,
          Group: mockGroup.Group,
          Subgroup: mockGroup.Subgroup,
        },
      ];
      instance.getRecordsQuery = vi.fn().mockResolvedValueOnce(mockGroupStoreRecord);

      // Act
      const result = await instance.getUsersInGroup(mockGroup.Namespace, mockGroup.Group, mockGroup.Subgroup);

      // Assert
      expect(result).toEqual([mockGroupStoreRecord[0].PushID]);
      expect(instance.getRecordsQuery).toHaveBeenCalledWith(
        { field: 'CompositeID', value: `${mockGroup.Namespace}/${mockGroup.Group}/${mockGroup.Subgroup}` },
        'CompositeIDIndex'
      );
    });

    it('should fetch a list of user in a group based on its namespace and group but no subgroup', async () => {
      // Arrange
      vi.useFakeTimers();
      const date = new Date();
      vi.setSystemTime(new Date());
      const mockGroupStoreRecord: IGroupStoreRecord[] = [
        {
          PushID: mockPushID,
          GroupID: mockGroupID,
          CompositeID: mockGroup.CompositeID,
          Date: date.toISOString(),
          Namespace: mockGroup.Namespace,
          Group: mockGroup.Group,
        },
      ];
      instance.getRecordsQuery = vi.fn().mockResolvedValueOnce(mockGroupStoreRecord);

      // Act
      const result = await instance.getUsersInGroup(mockGroup.Namespace, mockGroup.Group);

      // Assert
      expect(result).toEqual([mockGroupStoreRecord[0].PushID]);
      expect(instance.getRecordsQuery).toHaveBeenCalledWith(
        { field: 'CompositeID', value: `${mockGroup.Namespace}/${mockGroup.Group}` },
        'CompositeIDIndex'
      );
    });

    it('should return an empty array if a user has no groups', async () => {
      // Arrange
      instance.getRecordsQuery = vi.fn().mockResolvedValueOnce(null);

      // Act
      const result = await instance.getUsersInGroup(mockGroup.Namespace, mockGroup.Group, mockGroup.Subgroup);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('joinGroups', () => {
    const mockJoinGroups: IModifyGroups[] = [
      {
        Namespace: 'travel',
        Group: 'france',
        Subgroup: 'IMMEDIATE',
        Action: GroupActionEnum.JOIN,
      },
    ];
    const date = '2026-01-01T00:00:00.000Z';
    const mockGroupStoreRecord: IGroupStoreRecord[] = [
      {
        PushID: mockPushID,
        GroupID: mockGroupID,
        CompositeID: `${mockJoinGroups[0].Namespace}/${mockJoinGroups[0].Group}/${mockJoinGroups[0].Subgroup}`,
        Date: date,
        Namespace: mockJoinGroups[0].Namespace,
        Group: mockJoinGroups[0].Group,
        Subgroup: mockJoinGroups[0].Subgroup,
      },
    ];
    const mockCompositeID = `${mockJoinGroups[0].Namespace}/${mockJoinGroups[0].Group}/${mockJoinGroups[0].Subgroup}`;

    it("should add a user to a group using the namespace, group, and subgroup, then update the user's group list", async () => {
      // Act
      vi.useFakeTimers();
      vi.setSystemTime(new Date(date));
      const usersGroups: IGroups[] = [];

      // Arrange
      const result = await instance.joinGroups(mockPushID, mockJoinGroups, usersGroups);

      // Assert
      expect(instance.createRecordBatch).toHaveBeenCalledWith(mockGroupStoreRecord);
      expect(result).toEqual([
        {
          GroupID: mockGroupID,
          CompositeID: mockCompositeID,
          Namespace: mockJoinGroups[0].Namespace,
          Group: mockJoinGroups[0].Group,
          Subgroup: mockJoinGroups[0].Subgroup,
        },
      ]);
    });

    it("should add a user to a group using the namespace and group if no subgroup is provided, then update the user's group list", async () => {
      // Arrange
      vi.useFakeTimers();
      vi.setSystemTime(new Date(date));
      const mockGroupStoreRecordNoSubgroup = [
        { ...mockGroupStoreRecord[0], CompositeID: `travel/france`, Subgroup: undefined },
      ];
      const mockJoinGroupsNoSubgroup = [{ ...mockJoinGroups[0], Subgroup: undefined }];
      const usersGroups: IGroups[] = [];

      // Act
      const result = await instance.joinGroups(mockPushID, mockJoinGroupsNoSubgroup, usersGroups);

      // Assert
      expect(instance.createRecordBatch).toHaveBeenCalledWith(mockGroupStoreRecordNoSubgroup);
      expect(result).toEqual([
        {
          GroupID: mockGroupID,
          CompositeID: `travel/france`,
          Namespace: mockJoinGroupsNoSubgroup[0].Namespace,
          Group: mockJoinGroupsNoSubgroup[0].Group,
          Subgroup: mockJoinGroupsNoSubgroup[0].Subgroup,
        },
      ]);
    });

    it('should compare the users existing groups to the join request and log if the user is already part of that group', async () => {
      // Arrange
      instance.getUsersGroups = vi.fn().mockResolvedValueOnce([
        {
          GroupID: mockGroupID,
          CompositeID: `${mockJoinGroups[0].Namespace}/${mockJoinGroups[0].Group}/${mockJoinGroups[0].Subgroup}`,
          Namespace: mockJoinGroups[0].Namespace,
          Group: mockJoinGroups[0].Group,
          Subgroup: mockJoinGroups[0].Subgroup,
        },
      ]);
      const usersGroups: IGroups[] = [
        {
          GroupID: mockGroupID,
          CompositeID: `${mockJoinGroups[0].Namespace}/${mockJoinGroups[0].Group}/${mockJoinGroups[0].Subgroup}`,
          Namespace: mockJoinGroups[0].Namespace,
          Group: mockJoinGroups[0].Group,
          Subgroup: mockJoinGroups[0].Subgroup,
        },
      ];

      // Act
      await instance.joinGroups(mockPushID, mockJoinGroups, usersGroups);

      // Assert
      expect(observabilityMocks.logger.warn).toHaveBeenCalledWith(
        'Request tried to join a group user is already part of',
        { PushID: mockPushID, CompositeID: mockCompositeID }
      );
    });

    it('should complete the function successfully if no groups to join were provided', async () => {
      // Arrange
      const usersGroups: IGroups[] = [];

      // Act
      const result = await instance.joinGroups(mockPushID, [], usersGroups);

      // Assert
      expect(instance.createRecordBatch).not.toHaveBeenCalled();
      expect(result).toEqual(usersGroups);
      expect(observabilityMocks.logger.debug).toHaveBeenCalledWith(
        'No groups to join provided - returning usersGroups',
        { pushID: mockPushID }
      );
    });
  });

  describe('leaveGroups', () => {
    const mockLeaveGroups: IModifyGroups[] = [
      {
        Namespace: 'travel',
        Group: 'france',
        Subgroup: 'DAILY',
        Action: GroupActionEnum.LEAVE,
      },
    ];
    const date = '2026-01-01T00:00:00.000Z';
    const mockGroupStoreRecord: IGroupStoreRecord[] = [
      {
        PushID: mockPushID,
        GroupID: mockGroupID,
        CompositeID: `${mockLeaveGroups[0].Namespace}/${mockLeaveGroups[0].Group}/${mockLeaveGroups[0].Subgroup}`,
        Date: date,
        Namespace: mockLeaveGroups[0].Namespace,
        Group: mockLeaveGroups[0].Group,
        Subgroup: mockLeaveGroups[0].Subgroup,
      },
    ];

    it('should remove a user from a group using the namespace, group, and subgroup', async () => {
      // Arrange
      vi.useFakeTimers();
      vi.setSystemTime(new Date(date));
      const usersGroups: IGroups[] = [
        {
          GroupID: mockGroupID,
          CompositeID: `${mockLeaveGroups[0].Namespace}/${mockLeaveGroups[0].Group}/${mockLeaveGroups[0].Subgroup}`,
          Namespace: mockLeaveGroups[0].Namespace,
          Group: mockLeaveGroups[0].Group,
          Subgroup: mockLeaveGroups[0].Subgroup,
        },
      ];

      // Act
      const result = await instance.leaveGroups(mockPushID, mockLeaveGroups, usersGroups);

      // Assert
      expect(instance.deleteRecord).toHaveBeenCalledWith(mockGroupStoreRecord[0].GroupID, mockPushID);
      expect(result).toEqual([]);
    });

    it('should remove a user from a group using the namespace and group', async () => {
      // Arrange
      vi.useFakeTimers();
      vi.setSystemTime(new Date(date));
      const mockLeaveGroupsNoSubgroup = [{ ...mockLeaveGroups[0], Subgroup: undefined }];
      const usersGroups: IGroups[] = [
        {
          GroupID: mockGroupID,
          CompositeID: `travel/france`,
          Namespace: mockLeaveGroupsNoSubgroup[0].Namespace,
          Group: mockLeaveGroupsNoSubgroup[0].Group,
          Subgroup: mockLeaveGroupsNoSubgroup[0].Subgroup,
        },
      ];

      // Act
      const result = await instance.leaveGroups(mockPushID, mockLeaveGroupsNoSubgroup, usersGroups);

      // Assert
      expect(instance.deleteRecord).toHaveBeenCalledWith(mockGroupStoreRecord[0].GroupID, mockPushID);
      expect(result).toEqual([]);
    });

    it('should complete the function successfully if no user groups were found', async () => {
      // Arrange
      const usersGroups: IGroups[] = [];

      // Act
      const result = await instance.leaveGroups(mockPushID, mockLeaveGroups, usersGroups);

      // Assert
      expect(instance.deleteRecord).not.toHaveBeenCalled();
      expect(result).toEqual([]);
      expect(observabilityMocks.logger.debug).toHaveBeenCalledWith(
        'No user groups found for pushID - returning empty array',
        { pushID: mockPushID }
      );
    });

    it('should complete the function successfully if no groups to leave were provided', async () => {
      // Arrange
      const usersGroups: IGroups[] = [
        {
          GroupID: mockGroupID,
          CompositeID: `${mockLeaveGroups[0].Namespace}/${mockLeaveGroups[0].Group}/${mockLeaveGroups[0].Subgroup}`,
          Namespace: mockLeaveGroups[0].Namespace,
          Group: mockLeaveGroups[0].Group,
          Subgroup: mockLeaveGroups[0].Subgroup,
        },
      ];

      // Act
      const result = await instance.leaveGroups(mockPushID, [], usersGroups);

      // Assert
      expect(instance.deleteRecord).not.toHaveBeenCalled();
      expect(result).toEqual(usersGroups);
      expect(observabilityMocks.logger.debug).toHaveBeenCalledWith(
        'No groups to leave provided - returning usersGroups',
        { pushID: mockPushID }
      );
    });
  });
});
