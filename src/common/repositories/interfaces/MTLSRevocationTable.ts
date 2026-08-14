import z from 'zod';

export const mTLSRevocationRecordSchema = z.object({
  Id: z.string(),
  Arn: z.string(),
  StartDate: z.string(),
  EndDate: z.string(),
  Organization: z.string(),
  OrganizationalUnit: z.string(),
  CommonName: z.string(),
  Revoked: z.boolean(),
  ChecksumCert: z.string().optional(),
});

export const mTLSRevocation = mTLSRevocationRecordSchema.extend({ ChecksumCert: z.string() });
export type MTLSRevocation = z.infer<typeof mTLSRevocation>;
