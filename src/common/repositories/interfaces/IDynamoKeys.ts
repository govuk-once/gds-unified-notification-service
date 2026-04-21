import z from 'zod';

export const IDynamoAttributesSchema = z.object({
  tableName: z.string(),
  attributes: z.string().array(),
  hashKey: z.string(),
  rangeKey: z.string().nullish(),
  expirationAttribute: z.string().optional(),
  expirationDurationInSeconds: z.int().optional(),
});

export type IDynamoAttributes = z.infer<typeof IDynamoAttributesSchema>;
