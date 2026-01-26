import * as z from 'zod';
/**
 * Helper function taking in array of elements, and grouping them into a tuple of [all, valid, invalid] based on how which elements pass validation
 * Invalid elements are re-parsed using partial() so we can check against certain fields even if whole record failed
 */
export const groupValidation = <T, U extends z.ZodRawShape>(data: T[], schema: z.ZodObject<U>) => {
  const records = data.map((record) => [record, schema.safeParse(record)] as const);

  const valid = records
    .filter(([, parseResult]) => parseResult.success == true)
    .map(([record, parseResult]) => ({ raw: record, valid: parseResult.data! }));

  const invalid = records
    .filter(([, parseResult]) => parseResult.success == false)
    .map(([record]) => ({ raw: record, invalid: schema.partial().safeParse(record) }));

  return [data, valid, invalid] as const;
};
