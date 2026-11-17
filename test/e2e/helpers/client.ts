import { fetchMtlsCertificates } from '@shared/credentials';
import { config } from '@infra/cdk/config';
import { Agent } from 'undici';

export const prepareDispatchAgent = async (): Promise<Agent> => {
  // Ensure AWS env vars are available (ignore for codebuild)
  const runningCodeBuild = process.env.CODEBUILD_BUILD_ID !== undefined;
  if (
    !runningCodeBuild &&
    (process.env.AWS_ACCESS_KEY_ID == undefined ||
      process.env.AWS_SECRET_ACCESS_KEY == undefined ||
      process.env.AWS_REGION == undefined)
  ) {
    throw new Error(
      `No AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY present in env vars, please use 'eval $(gds-cli aws {accountName} -e)'`
    );
  }

  process.env.PREFIX = `uns-${config.env}`;

  const { crt, key } = await fetchMtlsCertificates();

  // Creates a https agent for mTLS using imported credentials
  const httpsAgent = new Agent({
    connect: {
      cert: crt,
      key: key,
      rejectUnauthorized: false,
    },
  });

  return httpsAgent;
};
