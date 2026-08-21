export interface IGroups {
  GroupID: string;
  CompositeID: string;
  Namespace: string;
  Group: string;
  Subgroup?: string;
}

/**
 * Test Fixtures
 */
export const mockIGroups = (): IGroups[] => [
  {
    GroupID: 'GROUP-01',
    CompositeID: `travel/spain/IMMEDIATE`,
    Namespace: 'travel',
    Group: 'spain',
    Subgroup: 'IMMEDIATE',
  },
];
