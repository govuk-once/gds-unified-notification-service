import z from 'zod';

export const GetGroupsResponseSchema = z.array(
  z.object({
    Namespace: z.string(),
    Group: z.string(),
    Subgroup: z.string().optional(),
  })
);

export type GetGroupsResponse = z.infer<typeof GetGroupsResponseSchema>;
