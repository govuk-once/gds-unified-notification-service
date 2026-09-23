import { IGroups } from '@project/lambdas';

export const mockIGroups = (): IGroups[] => [
  {
    GroupID: 'GROUP-01',
    CompositeID: `travel/spain/IMMEDIATE`,
    Namespace: 'travel',
    Group: 'spain',
    Subgroup: 'IMMEDIATE',
  },
];

export const mockMultipleIGroup = (): IGroups[] => [
  {
    GroupID: '7fdc189d-f2df-4642-bdf2-8ce047fd9250',
    Namespace: 'travel',
    Group: 'france',
    Subgroup: 'IMMEDIATE',
    CompositeID: 'travel/france/IMMEDIATE',
  },
  {
    GroupID: '6e2fa888-aeea-409b-a3cf-bb338e202d94',
    Namespace: 'travel',
    Group: 'spain',
    Subgroup: 'DAILY',
    CompositeID: 'travel/spain/DAILY',
  },
];
