import { iocGetGroupStoreDynamoRepository } from '@common/ioc';
import { GroupActionEnum, IModifyGroups } from '@common/models/interfaces';
import CustomWorld from '@test/e2e/support/world';

export type GroupEntry = Omit<IModifyGroups, 'Action'>;
const groupPath = (world: CustomWorld) => `/v1/groups?pushID=${world.pushID}`;

const getSubscribedGroups = async (world: CustomWorld): Promise<GroupEntry[]> => {
  const result = await world.flexAPI.get<GroupEntry[]>({ path: groupPath(world) });
  return result.body;
};

export const clearSubscribedGroups = async (world: CustomWorld) => {
  const groups = await getSubscribedGroups(world);
  if (groups.length === 0) return;

  await world.flexAPI.post({
    path: groupPath(world),
    body: groups.map((entry) => ({ ...entry, Action: GroupActionEnum.LEAVE })),
  });
};

export const joinGroups = async (world: CustomWorld, groups: GroupEntry[]) => {
  await world.flexAPI.post({
    path: groupPath(world),
    body: groups.map((entry) => ({ ...entry, Action: GroupActionEnum.JOIN })),
  });
};

export const addCleanUp = (world: CustomWorld, groups: GroupEntry[]) => {
  if (groups.length === 0) return;

  const removeAction = groups.map((group) => ({ ...group, Action: GroupActionEnum.LEAVE }));
  world.cleanups.push(async () => {
    await world.flexAPI.post({
      path: groupPath(world),
      body: removeAction,
    });
  });
};

export const getPushIDsForGroup = async (namespace: string, group: string, subgroup?: string): Promise<string[]> => {
  const groupRepository = await iocGetGroupStoreDynamoRepository();
  return groupRepository.getUsersInGroup(namespace, group, subgroup);
};
