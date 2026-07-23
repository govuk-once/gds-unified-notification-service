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
