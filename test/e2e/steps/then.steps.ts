/* eslint-disable vitest/no-standalone-expect */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NotificationStateEnum } from '@common/models';
import { defineParameterType, Then } from '@cucumber/cucumber';
import type CustomWorld from '@test/e2e/utils/world';
import { expect } from 'vitest';

enum ExpectedErrors {
  ConnectionError = 'a connection error',
  TransportError = 'a transport error',
  AuthenticationError = 'an authentication error',
  ValidationError = 'a validation error',
  ServerError = 'a server error',
  NotFoundError = 'a not found error',
  UnauthorisedError = 'an unauthorised error',
}

defineParameterType({
  name: 'expectedError',
  regexp:
    /a connection error|a transport error|an authentication error|an unauthorised error|a validation error|a server error|a not found error/,
  transformer: (e) => e as ExpectedErrors,
});

Then('it should fail with {expectedError}', function (this: CustomWorld, expectedError: ExpectedErrors) {
  switch (expectedError) {
    case ExpectedErrors.ConnectionError:
      expect(this.result).toMatchObject({
        message: 'fetch failed',
        cause: expect.objectContaining(
          this.api.isPrivateGateway()
            ? { code: 'UND_ERR_CONNECT_TIMEOUT', name: 'ConnectTimeoutError' }
            : { code: 'ECONNREFUSED' }
        ),
      });
      break;
    case ExpectedErrors.TransportError:
      expect(this.result).toBeInstanceOf(Error);
      expect(
        (this.result as Error).name === 'FetchTimeoutError' || (this.result as Error).message === 'fetch failed'
      ).toBe(true);
      break;
    default: {
      const statusCodeMap: Record<string, number> = {
        [ExpectedErrors.ValidationError]: 400,
        [ExpectedErrors.UnauthorisedError]: 401,
        [ExpectedErrors.AuthenticationError]: 403,
        [ExpectedErrors.NotFoundError]: 404,
        [ExpectedErrors.ServerError]: 500,
      };
      const statusCode = statusCodeMap[expectedError];
      if (!statusCode) throw new Error(`Unhandled expected error: ${expectedError}`);
      expect(this.result).toBeInstanceOf(Error);
      expect((this.result as Error).message).toEqual(`API [${this.method}] ${this.path} Failed with ${statusCode}`);
      break;
    }
  }
});

Then('it should succeed', function (this: CustomWorld) {
  if (!this.expectedStatusCode) throw new Error('Status code should be set in the When step');
  expect(this.result.status).toBe(this.expectedStatusCode);
  if (this.expectedResponseBody) {
    expect(this.result.body).toEqual(this.expectedResponseBody);
  }
});

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
