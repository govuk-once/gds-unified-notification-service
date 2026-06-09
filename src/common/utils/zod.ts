import * as z from 'zod';
/**
 * Helper function taking in array of elements, and grouping them into a tuple of [all, valid, invalid] based on how which elements pass validation
 * Invalid elements are re-parsed using partial() so we can check against certain fields even if whole record failed
 */
export const groupValidation = async <T, U extends z.ZodRawShape>(data: T[], schema: z.ZodObject<U>) => {
  const records = await Promise.all(data.map(async (record) => [record, await schema.safeParseAsync(record)] as const));

  const valid = records
    .filter(([, parseResult]) => parseResult.success == true)
    .map(([record, parseResult]) => ({ raw: record, valid: parseResult.data! }));

  const invalid = records
    .filter(([, parseResult]) => parseResult.success == false)
    .map(([record, parseResult]) => {
      const errors = parseResult.error ? z.prettifyError(parseResult.error) : {};
      return { raw: record, errors };
    });

  return [data, valid, invalid] as const;
};

export const errorFormatter = (error: z.ZodError) => {
  const validationErrors = [];
  const formattedErrors = error.issues.map((issue) => {
    if (issue.path.length > 0) {
      const pathString = issue.path.join('.');
      return `${issue.message} → at ${pathString}.`;
    } else {
      return issue.message;
    }
  });

  validationErrors.push(...formattedErrors);
  return validationErrors;
};
