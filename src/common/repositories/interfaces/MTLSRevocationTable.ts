import z from 'zod';

export interface MTLSRevocation {
  Id: string;
  Arn: string;
  StartDate: string;
  EndDate: string;
  Organization: string;
  OrganizationalUnit: string;
  CommonName: string;
  ChecksumCert: string;
  Revoked: boolean;
}

export const mTLSRevocationSchema = z.object({
  Id: z.string(),
  Arn: z.string(),
  StartDate: z.string(),
  EndDate: z.string(),
  Organization: z.string(),
  OrganizationalUnit: z.string(),
  CommonName: z.string(),
  ChecksumCert: z.string(),
  Revoked: z.boolean(),
});
