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
  function (this: CustomWorld, method: string, apiErrors: APIErrors) {
    if (apiErrors === APIErrors.ConnectionProtocolError) {
      expect(this.result).toMatchObject({
        message: 'fetch failed',
        cause: expect.objectContaining(
          this.api.isPrivateGateway()
            ? { code: 'UND_ERR_CONNECT_TIMEOUT', name: 'ConnectTimeoutError' }
            : { code: 'ECONNREFUSED' }
        ),
      });
    } else if (apiErrors === APIErrors.TransportError) {
      expect(this.result).toBeInstanceOf(Error);
      const err = this.result as Error;
      expect(err.name === 'FetchTimeoutError' || err.message === 'fetch failed').toBe(true);
    } else {
      throw new Error('Undefined error scenario');
    }
  }
);

Then('the {string} request should fail with a {int}', function (this: CustomWorld, method: string, statusCode: number) {
  expect(this.result).toBeInstanceOf(Error);
  expect((this.result as Error).message).toEqual(`API [${method}] ${this.path} Failed with ${statusCode}`);
});

Then(
  'the {string} request should succeeded with a {int}',
  function (this: CustomWorld, method: string, statusCode: number) {
    expect(this.result.status).toBe(statusCode);
  }
);

defineParameterType({
  name: 'notificationStatusArray',
  regexp: /"([^"]+)"/,
  transformer: (s) => s.split(',').map((v) => v.trim()) as NotificationStateEnum[],
});

Then(
  'I expect response to contain {notificationStatusArray}',
  function (this: CustomWorld, notificationStatuses: NotificationStateEnum[]) {
    expect(this.result.body).toEqual(
      expect.arrayContaining(
        notificationStatuses.map((Status) =>
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          expect.objectContaining({
            Status,
            NotificationID: this.knownTestIDs.notificationID,
          })
        )
      )
    );
  }
);
