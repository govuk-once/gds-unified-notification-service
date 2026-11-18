/* eslint-disable vitest/no-standalone-expect */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NotificationStateEnum } from '@common/models';
import { FetchErrorResponse } from '@common/services/FetchService';
import { defineParameterType, Then } from '@cucumber/cucumber';
import type CustomWorld from '@test/e2e/support/world';
import { expect } from 'vitest';

// ──────────────────────────────────────────────────
// Outcome - whether the request the scenario sent
// succeeded or failed, whatever the resource
// ──────────────────────────────────────────────────

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
      expect(this.result).toBeInstanceOf(FetchErrorResponse);
      expect((this.result as Error).message).toEqual(`API [${this.method}] ${this.path} Failed with ${statusCode}`);
      break;
    }
  }
});

Then('it should succeed', function (this: CustomWorld) {
  if (!this.result) throw new Error('Result should be set in the When step');
  if (!this.expectedStatusCode) throw new Error('Status code should be set in the When step');
  expect(this.result.status).toBe(this.expectedStatusCode);
  for (const assert of this.assertions) {
    assert(this.result.body);
  }
});

defineParameterType({
  name: 'notificationStatusArray',
  regexp: /"([^"]+)"/,
  transformer: (s) => s.split(',').map((v) => v.trim()) as NotificationStateEnum[],
});

Then(
  'it should succeed with statuses {notificationStatusArray}',
  function (this: CustomWorld, notificationStatuses: NotificationStateEnum[]) {
    if (!this.result) throw new Error('Result should be set in the When step');
    expect(this.result.status).toBe(200);
    for (const Status of notificationStatuses) {
      expect(this.result.body).toContainEqual(
        expect.objectContaining({ Status, NotificationID: this.notificationID })
      );
    }
  }
);
