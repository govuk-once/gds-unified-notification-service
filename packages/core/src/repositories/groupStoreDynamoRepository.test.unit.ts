import { GroupStoreDynamoRepository } from '@common/repositories/groupStoreDynamoRepository';
import { IDynamoAttributesSchema, IGroupStoreRecord } from '@common/repositories/interfaces';
import { GroupActionEnum, IGroups, IModifyGroups } from '@common/models/interfaces';
import SSMParameters from '@shared/ssmParameter';
import {
  iocSpies,
  mockAWSClientsExpectedBehaviour,
  mockIGroups,
  mockIGroupStoreRecord,
  mockServicesExpectedBehaviour,
} from '@test/mocks';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/util-dynamodb', { spy: true });

vi.mock('@common/services', { spy: true });

const groupsID = 'd63d1fea-5731-4350-a54f-2e0ddaeae943';
vi.mock('uuid', () => ({
  v4: () => groupsID,
}));

describe('GroupStoreDynamoRepository', async () => {
  let instance: GroupStoreDynamoRepository;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, awsClientMocks, serviceMocks } = await iocSpies();

  // Test Fixtures
  const mockPushID = '2536bd9b-611b-453c-ba3d-e34783e4c9d1';
  const date = new Date('2026-01-01T12:00:00.000Z');
  const groups = mockIGroups();
  const groupsStoreRecord = mockIGroupStoreRecord();

  beforeEach(async () => {
    // Reset all mock
    vi.resetAllMocks();
    vi.useRealTimers();

    // Mock SSM store and services responses
    mockServicesExpectedBehaviour(serviceMocks);
    mockAWSClientsExpectedBehaviour(awsClientMocks);

    instance = await GroupStoreDynamoRepository.create(
      serviceMocks.configurationServiceMock,
      observabilityMocks,
      awsClientMocks.dynamoDBClientMock
    );

    // Creating spies of DynamoRepository
    instance.getRecordsQuery = vi.fn().mockResolvedValueOnce(undefined);
    instance.deleteRecord = vi.fn().mockResolvedValueOnce(undefined);
    instance.createRecordBatch = vi.fn().mockResolvedValueOnce(undefined);
  });

  describe('create', () => {
    it('should call create with correct params', async () => {
      // Act
      const result = await GroupStoreDynamoRepository.create(
        serviceMocks.configurationServiceMock,
        observabilityMocks,
        awsClientMocks.dynamoDBClientMock
      );

      // Assert
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith(
        SSMParameters.Table.GroupStore.Attributes,
        IDynamoAttributesSchema
      );
      expect(result).toBeInstanceOf(GroupStoreDynamoRepository);
    });
  });

  describe('getUsersGroups', () => {
    it('should fetch a user groups based on their pushID', async () => {
      // Arrange
      vi.useFakeTimers();
      vi.setSystemTime(date);
      instance.getRecordsQuery = vi.fn().mockResolvedValueOnce([groupsStoreRecord]);

      // Act
      const result = await instance.getUsersGroups(mockPushID);

      // Assert
      expect(result).toEqual(groups);
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
      vi.setSystemTime(date);
      instance.getRecordsQuery = vi.fn().mockResolvedValueOnce([groupsStoreRecord]);

      // Act
      const result = await instance.getUsersInGroup(groups[0].Namespace, groups[0].Group, groups[0].Subgroup);

      // Assert
      expect(result).toEqual([groupsStoreRecord.PushID]);
      expect(instance.getRecordsQuery).toHaveBeenCalledWith(
        { field: 'CompositeID', value: `${groups[0].Namespace}/${groups[0].Group}/${groups[0].Subgroup}` },
        'CompositeIDIndex'
      );
    });

    it('should fetch a list of user in a group based on its namespace and group but no subgroup', async () => {
      // Arrange
      vi.useFakeTimers();
      vi.setSystemTime(date);
      instance.getRecordsQuery = vi.fn().mockResolvedValueOnce([groupsStoreRecord]);

      // Act
      const result = await instance.getUsersInGroup(groups[0].Namespace, groups[0].Group);

      // Assert
      expect(result).toEqual([groupsStoreRecord.PushID]);
      expect(instance.getRecordsQuery).toHaveBeenCalledWith(
        { field: 'CompositeID', value: `${groups[0].Namespace}/${groups[0].Group}` },
        'CompositeIDIndex'
      );
    });

    it('should return an empty array if a user has no groups', async () => {
      // Arrange
      instance.getRecordsQuery = vi.fn().mockResolvedValueOnce(null);

      // Act
      const result = await instance.getUsersInGroup(groups[0].Namespace, groups[0].Group, groups[0].Subgroup);

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
    const groupsStoreRecord: IGroupStoreRecord[] = [
      {
        PushID: mockPushID,
        GroupID: groupsID,
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
      expect(instance.createRecordBatch).toHaveBeenCalledWith(groupsStoreRecord);
      expect(result).toEqual([
        {
          GroupID: groupsID,
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
      const groupsStoreRecordNoSubgroup = [
        { ...groupsStoreRecord[0], CompositeID: `travel/france`, Subgroup: undefined },
      ];
      const mockJoinGroupsNoSubgroup = [{ ...mockJoinGroups[0], Subgroup: undefined }];
      const usersGroups: IGroups[] = [];

      // Act
      const result = await instance.joinGroups(mockPushID, mockJoinGroupsNoSubgroup, usersGroups);

      // Assert
      expect(instance.createRecordBatch).toHaveBeenCalledWith(groupsStoreRecordNoSubgroup);
      expect(result).toEqual([
        {
          GroupID: groupsID,
          CompositeID: `travel/france`,
          Namespace: mockJoinGroupsNoSubgroup[0].Namespace,
          Group: mockJoinGroupsNoSubgroup[0].Group,
          Subgroup: mockJoinGroupsNoSubgroup[0].Subgroup,
        },
      ]);
    });

    it('should compare the users existing groups to the join request and log if the user is already part of that group', async () => {
      // Arrange
      const usersGroups: IGroups[] = [
        {
          GroupID: groupsID,
          CompositeID: `${mockJoinGroups[0].Namespace}/${mockJoinGroups[0].Group}/${mockJoinGroups[0].Subgroup}`,
          Namespace: mockJoinGroups[0].Namespace,
          Group: mockJoinGroups[0].Group,
          Subgroup: mockJoinGroups[0].Subgroup,
        },
      ];

      // Act
      const result = await instance.joinGroups(mockPushID, mockJoinGroups, usersGroups);

      // Assert
      expect(observabilityMocks.logger.warn).toHaveBeenCalledWith(
        'Request tried to join a group user is already part of',
        { PushID: mockPushID, CompositeID: mockCompositeID }
      );
      expect(instance.createRecordBatch).not.toHaveBeenCalled();
      expect(result).toEqual(usersGroups);
    });

    it('should only create records for the groups the user is not already part of when the request is mixed', async () => {
      // Arrange
      vi.useFakeTimers();
      vi.setSystemTime(new Date(date));
      const existingGroup: IGroups = {
        GroupID: 'existing-group-id',
        CompositeID: mockCompositeID,
        Namespace: mockJoinGroups[0].Namespace,
        Group: mockJoinGroups[0].Group,
        Subgroup: mockJoinGroups[0].Subgroup,
      };
      const newGroup: IModifyGroups = {
        Namespace: 'travel',
        Group: 'spain',
        Subgroup: 'DAILY',
        Action: GroupActionEnum.JOIN,
      };

      // Act
      const result = await instance.joinGroups(mockPushID, [mockJoinGroups[0], newGroup], [existingGroup]);

      // Assert
      expect(instance.createRecordBatch).toHaveBeenCalledWith([
        {
          PushID: mockPushID,
          GroupID: groupsID,
          CompositeID: 'travel/spain/DAILY',
          Date: date,
          Namespace: 'travel',
          Group: 'spain',
          Subgroup: 'DAILY',
        },
      ]);
      expect(result).toEqual([
        existingGroup,
        {
          GroupID: groupsID,
          CompositeID: 'travel/spain/DAILY',
          Namespace: 'travel',
          Group: 'spain',
          Subgroup: 'DAILY',
        },
      ]);
      expect(observabilityMocks.logger.warn).toHaveBeenCalledTimes(1);
    });

    it('should treat a group with and without a subgroup as different groups', async () => {
      // Arrange
      vi.useFakeTimers();
      vi.setSystemTime(new Date(date));
      const noSubgroup: IModifyGroups = { ...mockJoinGroups[0], Subgroup: undefined };

      // Act
      const result = await instance.joinGroups(mockPushID, [noSubgroup, mockJoinGroups[0]], []);

      // Assert
      expect(result.map((g) => g.CompositeID)).toEqual(['travel/france', mockCompositeID]);
      expect(observabilityMocks.logger.warn).not.toHaveBeenCalled();
    });

    it('should only create one record if the same group is requested more than once', async () => {
      // Arrange
      vi.useFakeTimers();
      vi.setSystemTime(new Date(date));
      const usersGroups: IGroups[] = [];

      // Act
      const result = await instance.joinGroups(mockPushID, [mockJoinGroups[0], mockJoinGroups[0]], usersGroups);

      // Assert
      expect(instance.createRecordBatch).toHaveBeenCalledWith(groupsStoreRecord);
      expect(result).toEqual([
        {
          GroupID: groupsID,
          CompositeID: mockCompositeID,
          Namespace: mockJoinGroups[0].Namespace,
          Group: mockJoinGroups[0].Group,
          Subgroup: mockJoinGroups[0].Subgroup,
        },
      ]);
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
    const groupsStoreRecord: IGroupStoreRecord[] = [
      {
        PushID: mockPushID,
        GroupID: groupsID,
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
          GroupID: groupsID,
          CompositeID: `${mockLeaveGroups[0].Namespace}/${mockLeaveGroups[0].Group}/${mockLeaveGroups[0].Subgroup}`,
          Namespace: mockLeaveGroups[0].Namespace,
          Group: mockLeaveGroups[0].Group,
          Subgroup: mockLeaveGroups[0].Subgroup,
        },
      ];

      // Act
      const result = await instance.leaveGroups(mockPushID, mockLeaveGroups, usersGroups);

      // Assert
      expect(instance.deleteRecord).toHaveBeenCalledWith(groupsStoreRecord[0].GroupID, mockPushID);
      expect(result).toEqual([]);
    });

    it('should remove a user from a group using the namespace and group', async () => {
      // Arrange
      vi.useFakeTimers();
      vi.setSystemTime(new Date(date));
      const mockLeaveGroupsNoSubgroup = [{ ...mockLeaveGroups[0], Subgroup: undefined }];
      const usersGroups: IGroups[] = [
        {
          GroupID: groupsID,
          CompositeID: `travel/france`,
          Namespace: mockLeaveGroupsNoSubgroup[0].Namespace,
          Group: mockLeaveGroupsNoSubgroup[0].Group,
          Subgroup: mockLeaveGroupsNoSubgroup[0].Subgroup,
        },
      ];

      // Act
      const result = await instance.leaveGroups(mockPushID, mockLeaveGroupsNoSubgroup, usersGroups);

      // Assert
      expect(instance.deleteRecord).toHaveBeenCalledWith(groupsStoreRecord[0].GroupID, mockPushID);
      expect(result).toEqual([]);
    });

    it('should only delete a group once if the same group is requested more than once', async () => {
      // Arrange
      const usersGroups: IGroups[] = [
        {
          GroupID: groupsID,
          CompositeID: `${mockLeaveGroups[0].Namespace}/${mockLeaveGroups[0].Group}/${mockLeaveGroups[0].Subgroup}`,
          Namespace: mockLeaveGroups[0].Namespace,
          Group: mockLeaveGroups[0].Group,
          Subgroup: mockLeaveGroups[0].Subgroup,
        },
      ];

      // Act
      const result = await instance.leaveGroups(mockPushID, [mockLeaveGroups[0], mockLeaveGroups[0]], usersGroups);

      // Assert
      expect(instance.deleteRecord).toHaveBeenCalledTimes(1);
      expect(instance.deleteRecord).toHaveBeenCalledWith(groupsID, mockPushID);
      expect(result).toEqual([]);
    });

    it('should delete every record the user holds for a group they leave', async () => {
      // Arrange
      const compositeID = `${mockLeaveGroups[0].Namespace}/${mockLeaveGroups[0].Group}/${mockLeaveGroups[0].Subgroup}`;
      const duplicateRows: IGroups[] = ['group-id-1', 'group-id-2'].map((GroupID) => ({
        GroupID,
        CompositeID: compositeID,
        Namespace: mockLeaveGroups[0].Namespace,
        Group: mockLeaveGroups[0].Group,
        Subgroup: mockLeaveGroups[0].Subgroup,
      }));

      // Act
      const result = await instance.leaveGroups(mockPushID, mockLeaveGroups, duplicateRows);

      // Assert
      expect(instance.deleteRecord).toHaveBeenCalledTimes(2);
      expect(instance.deleteRecord).toHaveBeenCalledWith('group-id-1', mockPushID);
      expect(instance.deleteRecord).toHaveBeenCalledWith('group-id-2', mockPushID);
      expect(result).toEqual([]);
    });

    it('should only delete the groups the user is part of and keep the rest in order when the request is mixed', async () => {
      // Arrange
      const usersGroups: IGroups[] = [
        { GroupID: 'keep-1', CompositeID: 'travel/spain', Namespace: 'travel', Group: 'spain', Subgroup: undefined },
        {
          GroupID: groupsID,
          CompositeID: `${mockLeaveGroups[0].Namespace}/${mockLeaveGroups[0].Group}/${mockLeaveGroups[0].Subgroup}`,
          Namespace: mockLeaveGroups[0].Namespace,
          Group: mockLeaveGroups[0].Group,
          Subgroup: mockLeaveGroups[0].Subgroup,
        },
        { GroupID: 'keep-2', CompositeID: 'travel/italy', Namespace: 'travel', Group: 'italy', Subgroup: undefined },
      ];
      const notAMember: IModifyGroups = { Namespace: 'travel', Group: 'germany', Action: GroupActionEnum.LEAVE };

      // Act
      const result = await instance.leaveGroups(mockPushID, [notAMember, mockLeaveGroups[0]], usersGroups);

      // Assert
      expect(instance.deleteRecord).toHaveBeenCalledTimes(1);
      expect(instance.deleteRecord).toHaveBeenCalledWith(groupsID, mockPushID);
      expect(result).toEqual([usersGroups[0], usersGroups[2]]);
    });

    it('should still attempt every delete and return the remaining groups if one delete fails', async () => {
      // Arrange
      instance.deleteRecord = vi.fn().mockRejectedValueOnce(new Error('delete failed')).mockResolvedValue(undefined);
      const usersGroups: IGroups[] = [
        { GroupID: 'leave-1', CompositeID: 'travel/spain', Namespace: 'travel', Group: 'spain', Subgroup: undefined },
        { GroupID: 'leave-2', CompositeID: 'travel/italy', Namespace: 'travel', Group: 'italy', Subgroup: undefined },
        { GroupID: 'keep-1', CompositeID: 'travel/greece', Namespace: 'travel', Group: 'greece', Subgroup: undefined },
      ];
      const toLeave: IModifyGroups[] = [
        { Namespace: 'travel', Group: 'spain', Action: GroupActionEnum.LEAVE },
        { Namespace: 'travel', Group: 'italy', Action: GroupActionEnum.LEAVE },
      ];

      // Act
      const result = await instance.leaveGroups(mockPushID, toLeave, usersGroups);

      // Assert
      expect(instance.deleteRecord).toHaveBeenCalledTimes(2);
      expect(result).toEqual([usersGroups[2]]);
    });

    it('should ignore a group the user is not part of and keep their existing groups', async () => {
      // Arrange
      const usersGroups: IGroups[] = [
        {
          GroupID: groupsID,
          CompositeID: 'travel/spain',
          Namespace: 'travel',
          Group: 'spain',
          Subgroup: undefined,
        },
      ];

      // Act
      const result = await instance.leaveGroups(mockPushID, mockLeaveGroups, usersGroups);

      // Assert
      expect(instance.deleteRecord).not.toHaveBeenCalled();
      expect(result).toEqual(usersGroups);
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
          GroupID: groupsID,
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
