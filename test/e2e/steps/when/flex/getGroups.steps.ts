import { When } from '@cucumber/cucumber';
import type CustomWorld from '@test/e2e/utils/world';

When('I attempt to get subscribed groups', async function (this: CustomWorld) {
  const pushID = this.resolvePushID();
  this.path = `/v1/groups${pushID ? `?pushID=${pushID}` : ''}`;
  await this.sendRequest('GET');
});

When('I get the subscribed groups', async function (this: CustomWorld) {
  const pushID = this.resolvePushID();
  this.path = `/v1/groups?pushID=${pushID}`;
  await this.sendRequest('GET');
});
