import { GroupActionEnum, IModifyGroups } from '@project/lambdas/interfaces/IModifyGroups';

export const mockIModifyGroups = (Action: GroupActionEnum): IModifyGroups[] => [
  {
    Namespace: 'travel',
    Group: 'france',
    Subgroup: 'IMMEDIATE',
    Action,
  },
];
