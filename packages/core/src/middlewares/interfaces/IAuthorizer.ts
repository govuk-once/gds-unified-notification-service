import { IOrganisationConfigSchema } from '@common/repositories';
import z from 'zod';

export const psoAuthorizerSchema = z.object({
  Organization: z.string(),
  OrganisationConfig: z
    .string()
    .transform((str, ctx) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return JSON.parse(str);
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: 'Invalid JSON string',
          path: ['OrganisationConfig'],
        });
      }
    })
    .pipe(IOrganisationConfigSchema),
});
