import z from 'zod';

export enum GroupActionEnum {
  JOIN = 'JOIN',
  LEAVE = 'LEAVE',
}

export const IModifyGroupsSchema = z.object({
  Namespace: z.string(),
  Group: z.string(),
  Subgroup: z.string().optional(),
  Action: z.enum(GroupActionEnum),
});
export type IModifyGroups = z.infer<typeof IModifyGroupsSchema>;
