import z from 'zod';

export const IDynamoKeyAttributesSchema = z.object({
  attributes: z.string().array(),
  hashKey: z.string(),
  rangeKey: z.string().nullish(),
  expirationAttribute: z.string().nullish(),
  expirationDurationInSeconds: z.string().nullish(),
});

export type IDynamoKeyAttributes = z.infer<typeof IDynamoKeyAttributesSchema>;
