import { When } from '@cucumber/cucumber';
import type CustomWorld from '@test/e2e/utils/world';

When('I set the path to {string}', function (this: CustomWorld, path: string) {
  this.path = path;
});

When('I send a {word} request with an empty body', async function (this: CustomWorld, method: string) {
  await this.sendRequest(method, {});
});
