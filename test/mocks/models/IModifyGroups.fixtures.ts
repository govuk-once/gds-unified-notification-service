import { GroupActionEnum, IModifyGroups } from '@common/models/interfaces';

export const mockIModifyGroups = (Action: GroupActionEnum): IModifyGroups[] => [
  {
    Namespace: 'travel',
    Group: 'france',
    Subgroup: 'IMMEDIATE',
    Action,
  },
];
