/* eslint-disable vitest/no-standalone-expect */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NotificationStateEnum } from '@common/models';
import { Then } from '@cucumber/cucumber';
import type CustomWorld from '@test/e2e/utils/world';
import { expect } from 'vitest';

Then('the request should fail with a connection protocol error', async function (this: CustomWorld) {
  await expect(this.result).rejects.toMatchObject({
    message: 'fetch failed',
    cause: expect.objectContaining(
      this.api.isPrivateGateway()
        ? { code: 'UND_ERR_CONNECT_TIMEOUT', name: 'ConnectTimeoutError' }
        : { code: 'ECONNREFUSED' }
    ),
  });
});

Then('the request should fail with a transport error', async function (this: CustomWorld) {
  const err = (await this.result.catch((e) => e as Error)) as Error;
  expect(err).toBeInstanceOf(Error);
  expect(err.name === 'FetchTimeoutError' || err.message === 'fetch failed').toBe(true);
});

Then(
  'the {string} request should fail with a {int}',
  async function (this: CustomWorld, method: string, statusCode: number) {
    await expect(this.result).rejects.toThrow(`API [${method}] ${this.path} Failed with ${statusCode}`);
  }
);

Then('the request should succeeded with a {int}', async function (this: CustomWorld, statusCode: number) {
  expect((await this.result).status).toBe(statusCode);
});

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
          NotificationID: this.notificationID,
        })
      )
    )
  );
});
