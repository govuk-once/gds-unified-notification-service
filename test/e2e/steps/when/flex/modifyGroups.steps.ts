import { GroupActionEnum } from '@common/models/interfaces';
import { DataTable, When } from '@cucumber/cucumber';
import CustomWorld from '@test/e2e/utils/world';
import { v4 as uuid } from 'uuid';
import { expect } from 'vitest';

const buildGroupEntry = (Namespace: string, Group: string, Subgroup?: string, Action?: string) => {
  if (Subgroup === '') Subgroup = undefined;
  return { Namespace, Group, Subgroup, Action };
};

When('I send a single request to modify the following groups:', async function (this: CustomWorld, table: DataTable) {
  this.pushId = uuid();
  this.path = `/v1/groups?pushID=${this.pushId}`;
  await cleanUpGroups(this, []);

  // Prepare request
  const requestBody = table
    .hashes()
    .map(({ Action, Namespace, Group, Subgroup }) => buildGroupEntry(Namespace, Group, Subgroup, Action.toUpperCase()));

  // Register Teardown
  const teardownBody = requestBody.map((group) => ({ ...group, Action: GroupActionEnum.LEAVE }));
  this.cleanups.push(async () => cleanUpGroups(this, teardownBody));

  // Execute Request
  await this.sendRequest('POST', requestBody);

  // Defined Expected Outcomes
  this.expectedStatusCode = 200;
  this.expectedResponseBody = requestBody
    .filter((x) => x.Action === GroupActionEnum.JOIN)
    .map(({ Action, ...groupDetails }) => groupDetails);
});

When('I attempt to modify groups without a request body', async function (this: CustomWorld) {
  const pushID = this.resolvePushID();
  this.path = `/v1/groups?pushID=${pushID}`;
  await this.sendRequest('POST', {});
});

const cleanUpGroups = async (world: CustomWorld, body: unknown) => {
  await world.sendRequest('POST', body);
  expect(world.result!.body).toEqual([]);
  world.result = undefined;
};
