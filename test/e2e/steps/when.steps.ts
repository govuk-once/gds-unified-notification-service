import { FetchErrorResponse } from '@common/services/FetchService';
import { When } from '@cucumber/cucumber';
import type CustomWorld from '@test/e2e/utils/world';
import { v4 as uuid } from 'uuid';

When('I send a {string} request to {string}', async function (this: CustomWorld, method: string, path: string) {
  const substrings: Record<string, string> = {
    $KNOWN_IDS_VALID_NOTIFICATION$: this.testIDs.mockNotificationID,
    $KNOWN_IDS_VALID_PUSH_ID$: this.testIDs.pushID,
    $RANDOM_UUID$: uuid(),
    $MISSING_ID$: '',
  };

  this.path = path.replace(/\$[A-Z_]+\$/g, (match) => {
    if (substrings[match] === undefined) throw new Error(`Unknown variable: ${match}`);
    return substrings[match];
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
