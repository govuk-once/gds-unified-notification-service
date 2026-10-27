import { domainName, fetchApiKeys, fetchMtlsCertificates } from '@shared/credentials';
import type { TestProject } from 'vitest/node';
import { config } from '@infra/cdk/config';

export default async function setup(project: TestProject) {
  // Ensure AWS env vars are available (ignore for codebuild)
  const runningCodeBuild = process.env.CODEBUILD_BUILD_ID !== undefined;
  if (
    !runningCodeBuild &&
    (process.env.AWS_ACCESS_KEY_ID === undefined ||
      process.env.AWS_SECRET_ACCESS_KEY === undefined ||
      process.env.AWS_REGION === undefined)
  ) {
    throw new Error(
      `No AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY present in env vars, please use 'eval $(gds-cli aws {accountName} -e)'`
    );
  }

  const usePrivateGateway = config.isE2ERunner;
  const psoUrl = await domainName(`pso`);
  const flexUrl = await domainName(`flex`, usePrivateGateway);
  const flexKeyMarker = usePrivateGateway ? 'private' : 'e2e';

  // Retrieve mTLS certificates from Secrets Manager
  const { crt, key } = await fetchMtlsCertificates();

  // Fetch API Keys from usage plans on the fly
  const apiKeys = await fetchApiKeys(flexKeyMarker);
  const psoApiKey = apiKeys.psoApiKey;
  const flexApiKey = apiKeys.flexApiKey;

  const isCI = config.isE2ERunner || process.env.GITHUB_ACTIONS === 'true';

  project.provide('e2eCredentials', { psoUrl, flexUrl, psoApiKey, flexApiKey, crt, key });
  project.provide('isCI', isCI);
}

declare module 'vitest' {
  export interface ProvidedContext {
    e2eCredentials: {
      psoUrl: string;
      flexUrl: string;
      psoApiKey: string;
      flexApiKey: string;
      crt: string;
      key: string;
    };
    isCI: boolean;
  }
}
