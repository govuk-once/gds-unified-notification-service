import { GroupActionEnum } from '@common/models';
import z from 'zod';

export const IModifyGroupsSchema = z
  .object({
    Namespace: z.string(),
    Group: z.string(),
    Subgroup: z.string().optional(),
    Action: z.enum(GroupActionEnum),
  })
  .array();

export type IModifyGroups = z.infer<typeof IModifyGroupsSchema>;
