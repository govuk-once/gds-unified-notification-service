/* eslint-disable vitest/no-standalone-expect */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NotificationStateEnum } from '@common/models';
import { defineParameterType, Then } from '@cucumber/cucumber';
import type CustomWorld from '@test/e2e/utils/world';
import { expect } from 'vitest';

export enum APIErrors {
  ConnectionProtocolError = 'with a connection protocol error',
  TransportError = 'with a transport error',
}

defineParameterType({
  name: 'APIErrors',
  regexp: /with a connection protocol error|with a transport error/,
  transformer: (s) => s as APIErrors,
});

Then(
  'the {string} request should fail {APIErrors}',
  async function (this: CustomWorld, method: string, apiErrors: APIErrors) {
    if (apiErrors === APIErrors.ConnectionProtocolError) {
      await expect(this.result).rejects.toMatchObject({
        message: 'fetch failed',
        cause: expect.objectContaining(
          this.api.isPrivateGateway()
            ? { code: 'UND_ERR_CONNECT_TIMEOUT', name: 'ConnectTimeoutError' }
            : { code: 'ECONNREFUSED' }
        ),
      });
    } else if (apiErrors === APIErrors.TransportError) {
      const err = (await this.result.catch((e) => e as Error)) as Error;

      expect(err).toBeInstanceOf(Error);
      expect(err.name === 'FetchTimeoutError' || err.message === 'fetch failed').toBe(true);
    } else {
      throw new Error('Undefined error scenario');
    }
  }
);

Then(
  'the {string} request should fail with a {int}',
  async function (this: CustomWorld, method: string, statusCode: number) {
    await expect(this.result).rejects.toThrow(`API [${method}] ${this.path} Failed with ${statusCode}`);
  }
);

Then(
  'the {string} request should succeeded with a {int}',
  async function (this: CustomWorld, method: string, statusCode: number) {
    expect((await this.result).status).toBe(statusCode);
  }
);

Then('a list of notification statues', async function (this: CustomWorld) {
  expect((await this.result).body).toEqual(
    expect.arrayContaining(
      [
        NotificationStateEnum.VALIDATED_API_CALL,
        NotificationStateEnum.PROCESSING,
        // Need a way to void test notification while adapter is not VOID.
        // NotificationStateEnum.PROCESSED,
        // NotificationStateEnum.DISPATCHING,
        // NotificationStateEnum.DISPATCHED,
      ].map((Status) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        expect.objectContaining({
          Status,
          NotificationID: this.testIDs.mockNotificationID.valid,
        })
      )
    )
  );
});
