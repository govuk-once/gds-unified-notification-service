import { Given } from '@cucumber/cucumber';
import { checkStatus, waitUntil } from '@test/e2e/utils/setup.e2e';
import type CustomWorld from '@test/e2e/utils/world';

Given('a {string} API client configured with an insecure HTTP protocol', function (this: CustomWorld, service: string) {
  switch (service) {
    case 'Flex':
      this.api = this.flexAPIUsingInsecureProtocol;
      break;
    case 'Pso':
      this.api = this.psoAPIUsingInsecureProtocol;
      break;
    default:
      throw new Error('Invalid inputted API client');
  }
});

Given('a {string} API client configured with an invalid api key', function (this: CustomWorld, service: string) {
  switch (service) {
    case 'Flex':
      this.api = this.flexAPIWithoutAPIKey;
      break;
    case 'Pso':
      this.api = this.psoAPIWithoutAPIKey;
      break;
    default:
      throw new Error('Invalid inputted API client');
  }
});

Given('a {string} API client', function (this: CustomWorld, service: string) {
  switch (service) {
    case 'Flex':
      this.api = this.flexAPI;
      break;
    case 'Pso':
      this.api = this.psoAPI;
      break;
    default:
      throw new Error('Invalid inputted API client');
  }
});

Given('a Pso API client missing MTLS certificate', function (this: CustomWorld) {
  this.api = this.psoAPIWithoutMTLSCert;
});

Given('a valid notification ID path', function (this: CustomWorld) {
  this.notificationID = this.testIDs.mockNotificationID.valid;
});

Given('a notificationID points at an non-existing resource', function (this: CustomWorld) {
  this.notificationID = this.testIDs.mockNotificationID.notFound;
});

Given('with a pushID', function (this: CustomWorld) {
  this.pushID = this.testIDs.pushID;
});

Given('with a pushID that is no associated with the notification', function (this: CustomWorld) {
  this.pushID = this.testIDs.pushID;
});

Given('no pushID', function () {});

Given('a notification record for that notification ID', async function (this: CustomWorld) {
  const initialCheck = await this.api.get({ path: `/status/${this.notificationID}` });
  if (initialCheck.status === 404) {
    this.messageRequest = [
      {
        NotificationID: this.notificationID!,
        CampaignID: 'TestCampaignID',
        DepartmentID: 'TestDepartmentID',
        UserID: 'TestUserID',
        MessageTitle: 'You have a new Test Message',
        MessageBody: 'Open Notification Centre to read your notifications',
        NotificationTitle: 'This message is an end to end test.',
        NotificationBody: 'Here is the Notification body.',
      },
    ];

    await this.psoAPI.post({ path: '/send', body: this.messageRequest });
    await waitUntil(() => checkStatus(this.psoAPI, this.notificationID!), { timeout: 30000, interval: 2000 });
  }
});
