/* eslint-disable vitest/no-standalone-expect */
import { When } from '@cucumber/cucumber';
import type CustomWorld from '@test/e2e/support/world';
import { expect } from 'vitest';

// ──────────────────────────────────────────────────
// When: GET /status
// ──────────────────────────────────────────────────

When('I attempt to get the PSO status', async function (this: CustomWorld) {
  this.expectedStatusCode = 200;
  this.path = '/status';
  await this.sendRequest('GET');

  this.assertions.push((body) => {
    expect(body).toEqual({ status: 'ok' });
  });
});
