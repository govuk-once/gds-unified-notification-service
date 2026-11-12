import { GroupActionEnum } from '@common/models/interfaces';
import { DataTable, When } from '@cucumber/cucumber';
import CustomWorld from '@test/e2e/utils/world';

const buildGroupEntry = (Namespace: string, Group: string, Subgroup?: string, Action?: string) => {
  if (Subgroup === '') Subgroup = undefined;
  return { Namespace, Group, Subgroup, Action };
};

// Tracks cumulative group subscriptions across ordered scenarios
const subscribedGroups = new Map<string, object>();

When('I send a single request to modify the following groups:', async function (this: CustomWorld, table: DataTable) {
  const pushID = this.resolvePushID();

  const body = table
    .hashes()
    .map(({ Action, Namespace, Group, Subgroup }) => buildGroupEntry(Namespace, Group, Subgroup, Action.toUpperCase()));

  this.path = `/v1/groups?pushID=${pushID}`;
  await this.sendRequest('POST', body);

  if (this.result.status === 200) {
    for (const { Action, Namespace, Group, Subgroup } of body) {
      const key = `${Namespace}|${Group}|${Subgroup}`;
      if (Action === GroupActionEnum.LEAVE) {
        subscribedGroups.delete(key);
      } else {
        subscribedGroups.set(key, buildGroupEntry(Namespace, Group, Subgroup));
      }
    }
    this.expectedStatusCode = 200;
    this.expectedResponseBody = [...subscribedGroups.values()];
  }
});

When('I attempt to modify groups without a request body', async function (this: CustomWorld) {
  const pushID = this.resolvePushID();
  this.path = `/v1/groups?pushID=${pushID}`;
  await this.sendRequest('POST', {});
});
