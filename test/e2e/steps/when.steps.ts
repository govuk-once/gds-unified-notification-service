import { When } from '@cucumber/cucumber';
import type CustomWorld from '@test/e2e/utils/world';

When('I attempt to delete the notification', function (this: CustomWorld) {
  this.path = `/notifications/${this.notificationID}${this.pushID ? `?pushID=${this.pushID}` : ''}`;
  this.result = this.api.delete({ path: this.path });
});

When('I attempt to get the notification status', function (this: CustomWorld) {
  this.path = `/status/${this.notificationID}`;
  this.result = this.api.get({ path: this.path });
});
