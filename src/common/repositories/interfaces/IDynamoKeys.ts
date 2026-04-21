import z from 'zod';

export const IDynamoKeyAttributesSchema = z.object({
  tableName: z.string(),
  attributes: z.string().array(),
  hashKey: z.string(),
  rangeKey: z.string().nullish(),
  expirationAttribute: z.string().optional(),
  expirationDurationInSeconds: z.string().optional(),
});

export type IDynamoKeyAttributes = z.infer<typeof IDynamoKeyAttributesSchema>;
