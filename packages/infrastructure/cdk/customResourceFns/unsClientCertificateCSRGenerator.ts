import { PutSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import * as forge from 'node-forge';

export type GenerateCertificatesProps = {
  secretArn: string;
  commonName: string;
  organization: string;
  organizationalUnit: string;
};
const secretsManager = new SecretsManagerClient({});

export const handler = async (event: CloudFormationCustomResourceEvent<GenerateCertificatesProps>) => {
  // Gracefully skip execution if stack teardown is requested
  if (event.RequestType === 'Delete') {
    return { PhysicalResourceId: event.PhysicalResourceId };
  }

  const { commonName, organization, organizationalUnit } = event.ResourceProperties;

  // Generate a high-entropy 4096-bit RSA Key Pair
  const keys = forge.pki.rsa.generateKeyPair(4096);
  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

  // Draft the Certificate Signing Request (CSR) matching the subject constraints
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keys.publicKey;

  csr.setSubject([
    { name: 'commonName', value: commonName },
    { name: 'organizationName', value: organization },
    {
      name: 'organizationalUnitName',
      value: organizationalUnit,
    },
  ]);

  // Self-sign the CSR request wrapper locally
  csr.sign(keys.privateKey, forge.md.sha256.create());
  const csrPem = forge.pki.certificationRequestToPem(csr);

  // Save pem to SM
  await secretsManager.send(
    new PutSecretValueCommand({
      SecretId: event.ResourceProperties.secretArn,
      SecretString: privateKeyPem,
    })
  );

  // Return the generated PEM structural block back up to the CDK pipeline stack evaluation
  return {
    PhysicalResourceId: `${organization}-${organizationalUnit}-${commonName}`,
    Data: {
      CertRequestPem: csrPem,
    },
  };
};
