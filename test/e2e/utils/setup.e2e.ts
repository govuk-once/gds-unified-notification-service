import { NotificationStateEnum } from '@common/models';
import { FetchService } from '@common/services/FetchService';
import { INotificationStatus } from '@project/lambdas';
import { fetchMtlsCertificates } from '@shared/credentials';
import { config } from 'infrastructure/cdk/config';
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

export const waitUntil = async <T>(fn: () => Promise<T>, { timeout = 30000, interval = 2000 }) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      await fn();
      return;
    } catch {
      if (Date.now() + interval > deadline) throw new Error(`Timed out after ${timeout}ms`);
      await new Promise((r) => setTimeout(r, interval));
    }
  }
};

export const checkStatus = async (psoAPI: FetchService, notificationID: string) => {
  const result = await psoAPI.get({ path: `/status/${notificationID}` });
  const statuses = result.body as INotificationStatus[];
  const match = [
    NotificationStateEnum.VALIDATED_API_CALL,
    NotificationStateEnum.PROCESSING,
    // TODO: Need a way to void test notification while adapter is not VOID.
    // NotificationStateEnum.PROCESSED,
    // NotificationStateEnum.DISPATCHING
  ].every((expected) => statuses.map((s) => s.Status).includes(expected));

  if (!match) {
    throw new Error(`Missing status for ${notificationID}, got: ${statuses.map((s) => s.Status).join(', ')}`);
  }
  return statuses;
};
