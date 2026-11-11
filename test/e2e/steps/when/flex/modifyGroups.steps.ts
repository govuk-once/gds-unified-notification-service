import { GroupActionEnum } from '@common/models/interfaces';
import { DataTable, When } from '@cucumber/cucumber';
import type CustomWorld from '@test/e2e/utils/world';

const buildGroupEntry = (Namespace: string, Group: string, Subgroup?: string, Action?: string) => {
  if (Subgroup === '') Subgroup = undefined;
  return { Namespace, Group, Subgroup, Action };
};

// Tracks cumulative group subscriptions across ordered scenarios
const subscribedGroups = new Map<string, object>();

When(
  'I attempt to modify groups with a {word} push ID',
  async function (this: CustomWorld, pushIdState: string, table: DataTable) {
    const pushID = this.resolvePushID(pushIdState);

    const body = [];
    for (const row of table.rows()) {
      const [action, namespace, group, subgroup] = row;

      if (!Object.values(GroupActionEnum).includes(action as GroupActionEnum))
        throw new Error(`Invalid action: ${action}`);

      const key = `${namespace}|${group}|${subgroup}`;
      if ((action as GroupActionEnum) === GroupActionEnum.LEAVE) {
        subscribedGroups.delete(key);
      } else {
        subscribedGroups.set(key, buildGroupEntry(namespace, group, subgroup));
      }
      body.push(buildGroupEntry(namespace, group, subgroup, action));
    }

    this.expectedBody = [...subscribedGroups.values()];
    this.path = `/v1/groups?pushID=${pushID}`;
    await this.sendRequest('POST', body);
  }
);
