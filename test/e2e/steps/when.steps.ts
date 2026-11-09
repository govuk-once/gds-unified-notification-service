import { FetchErrorResponse } from '@common/services/FetchService';
import { When } from '@cucumber/cucumber';
import type CustomWorld from '@test/e2e/utils/world';
import { v4 as uuid } from 'uuid';

When('I send a {word} request to {string}', async function (this: CustomWorld, method: string, path: string) {
  const substrings: Record<string, string> = {
    knownNotificationId: this.knownTestIDs.notificationID,
    knownPushId: this.knownTestIDs.pushID,
    unknownNotificationId: uuid(),
    otherUserPushId: uuid(),
    missing: '',
  };

  this.path = path.replace(/\{([^}]+)\}/g, (match) => {
    const key = match.slice(1, -1); // Remove the curly braces
    if (substrings[key] === undefined) throw new Error(`Unknown variable: ${match}`);
    return substrings[key];
  });

  try {
    switch (method) {
      case 'POST':
        this.result = await this.api.post({ path: this.path });
        break;
      case 'GET':
        this.result = await this.api.get({ path: this.path });
        break;
      case 'DELETE':
        this.result = await this.api.delete({ path: this.path });
        break;
      case 'PUT':
        this.result = await this.api.put({ path: this.path });
        break;
    }
  } catch (e) {
    this.result = e as FetchErrorResponse;
  }
});
