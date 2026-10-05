import { When } from '@cucumber/cucumber';
import type CustomWorld from '@test/e2e/utils/world';

When('I send a {string} request to {string}', function (this: CustomWorld, method: string, path: string) {
  const substrings: Record<string, string> = {
    $VALID_NOTIFICATION$: this.testIDs.mockNotificationID.valid,
    $NOT_FOUND_NOTIFICATION$: this.testIDs.mockNotificationID.notFound,
    $VALID_PUSH_ID$: this.testIDs.pushID,
    $MISSING_PUSH_ID$: '',
  };

  this.path = path.replace(/\$[A-Z_]+\$/g, (match) => {
    if (substrings[match] === undefined) throw new Error(`Unknown variable: ${match}`);
    return substrings[match];
  });

  switch (method) {
    case 'POST':
      this.result = this.api.post({ path: this.path });
      break;
    case 'GET':
      console.log(this.api);
      console.log(this.path);
      this.result = this.api.get({ path: this.path });
      break;
    case 'DELETE':
      this.result = this.api.delete({ path: this.path });
      break;
    case 'PUT':
      this.result = this.api.put({ path: this.path });
      break;
  }
});
