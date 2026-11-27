/* eslint-disable vitest/no-standalone-expect */
import { GetGroupsResponseSchema, GroupActionEnum } from '@common/models/interfaces';
import { DataTable, Given, When } from '@cucumber/cucumber';
import { addCleanUp, joinGroups, clearSubscribedGroups, type GroupEntry } from '@test/e2e/helpers/groups';
import type CustomWorld from '@test/e2e/support/world';
import { e2eUUID } from '@test/e2e/helpers/uuid';
import { expect } from 'vitest';

const buildGroupEntry = (Namespace: string, Group: string, Subgroup?: string, Action?: string) => {
  if (Subgroup === '') Subgroup = undefined;
  return { Namespace, Group, Subgroup, Action };
};

const uniqueNamespace = (namespace: string, pushID: string) =>
  namespace ? `${namespace}-${pushID.slice(-8)}` : namespace;

// ──────────────────────────────────────────────────
// Given
// ──────────────────────────────────────────────────

Given('I have joined the following groups:', async function (this: CustomWorld, table: DataTable) {
  this.pushID = e2eUUID('group');
  await clearSubscribedGroups(this);

  const groups: GroupEntry[] = table.hashes().map(({ Namespace, Group, Subgroup }) => ({
    Namespace: uniqueNamespace(Namespace, this.pushID),
    Group,
    ...(Subgroup ? { Subgroup } : {}),
  }));

  await joinGroups(this, groups);
  addCleanUp(this, groups);
  this.joinedGroups = groups;
});

// ──────────────────────────────────────────────────
// When: GET /v1/groups
// ──────────────────────────────────────────────────

When('I attempt to get subscribed groups', async function (this: CustomWorld) {
  if (this.pushID === undefined) {
    this.pushID = e2eUUID('group');
  }
  this.path = `/v1/groups${this.pushID ? `?pushID=${this.pushID}` : ''}`;
  await this.sendRequest('GET');
  this.expectedStatusCode = 200;
  this.assertions.push((body) => {
    const groups = GetGroupsResponseSchema.parse(body);
    for (const group of this.joinedGroups) {
      expect(groups).toContainEqual(expect.objectContaining(group));
    }
  });
});

// ──────────────────────────────────────────────────
// When: POST /v1/groups
// ──────────────────────────────────────────────────

When('I send a single request to modify the following groups:', async function (this: CustomWorld, table: DataTable) {
  if (this.pushID === undefined) {
    this.pushID = e2eUUID('group');
    await clearSubscribedGroups(this);
  }
  this.path = `/v1/groups?pushID=${this.pushID}`;

  const requestBody = table
    .hashes()
    .map(({ Action, Namespace, Group, Subgroup }) =>
      buildGroupEntry(uniqueNamespace(Namespace, this.pushID), Group, Subgroup, Action.toUpperCase())
    );

  const expectedGroups = requestBody
    .filter((x) => x.Action === GroupActionEnum.JOIN)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ Action, ...groupDetails }) => groupDetails);

  await this.sendRequest('POST', requestBody);
  if (this.result?.status === 200) {
    addCleanUp(this, expectedGroups);
  }

  this.expectedStatusCode = 200;
  this.assertions.push((body) => {
    const groups = GetGroupsResponseSchema.parse(body);
    for (const item of expectedGroups) {
      expect(groups).toContainEqual(
        expect.objectContaining(item.Subgroup ? item : { Namespace: item.Namespace, Group: item.Group })
      );
    }
  });
});

When('I attempt to modify groups without a request body', async function (this: CustomWorld) {
  this.path = `/v1/groups?pushID=${this.pushID}`;
  await this.sendRequest('POST', {});
});
