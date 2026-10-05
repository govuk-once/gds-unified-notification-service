import { FetchErrorResponse } from '@common/services/FetchService';
import { defineParameterType, Given } from '@cucumber/cucumber';
import { checkStatus, waitUntil } from '@test/e2e/utils/setup.e2e';
import type CustomWorld from '@test/e2e/utils/world';

export enum APIConfigurations {
  InsecureHTTP = 'configured with an insecure HTTP',
  InvalidAPIKey = 'configured with an invalid api key',
  MissingMTLS = 'with missing MTLS certificate',
  CorrectConfig = 'configured correctly',
}

defineParameterType({
  name: 'APIConfig',
  regexp:
    /configured with an insecure HTTP|configured with an invalid api key|with missing MTLS certificate|configured correctly/,
  transformer: (s) => s as APIConfigurations,
});

Given('a {string} API client {APIConfig}', function (this: CustomWorld, service: string, apiConfig: APIConfigurations) {
  const apiClients: Record<string, Record<string, () => CustomWorld['api']>> = {
    Flex: {
      [APIConfigurations.InsecureHTTP]: () => this.flexAPIUsingInsecureProtocol,
      [APIConfigurations.InvalidAPIKey]: () => this.flexAPIWithoutAPIKey,
      [APIConfigurations.MissingMTLS]: () => {
        throw new Error('Flex API does not use mTLS certs');
      },
      [APIConfigurations.CorrectConfig]: () => this.flexAPI,
    },
    Pso: {
      [APIConfigurations.InsecureHTTP]: () => this.psoAPIUsingInsecureProtocol,
      [APIConfigurations.InvalidAPIKey]: () => this.psoAPIWithoutAPIKey,
      [APIConfigurations.MissingMTLS]: () => this.psoAPIWithoutMTLSCert,
      [APIConfigurations.CorrectConfig]: () => this.psoAPI,
    },
  };

  if (!apiClients[service]) throw new Error(`Unknown API service: ${service}`);
  if (!apiClients[service][apiConfig]) throw new Error(`Unknown API configuration: ${apiConfig}`);

  this.api = apiClients[service][apiConfig]();
});

Given('a notification record for that notification ID', async function (this: CustomWorld) {
  await this.api.get({ path: `/status/${this.testIDs.mockNotificationID.valid}` }).catch(async (e) => {
    if (e instanceof FetchErrorResponse) {
      if (e.status === 404) {
        this.messageRequest = [
          {
            NotificationID: this.testIDs.mockNotificationID.valid,
            CampaignID: 'TestCampaignID',
            DepartmentID: 'TestDepartmentID',
            UserID: 'TestUserID',
            MessageTitle: 'You have a new Test Message',
            MessageBody: 'Open Notification Centre to read your notifications',
            NotificationTitle: 'This message is an end to end test.',
            NotificationBody: 'Here is the Notification body.',
          },
        ];

        console.log('Test notification does not exist, creating test notification');
        await this.psoAPI.post({ path: '/send', body: this.messageRequest });
        await waitUntil(() => checkStatus(this.psoAPI, this.testIDs.mockNotificationID.valid), {
          timeout: 30000,
          interval: 2000,
        });
      }
    }
  });
});
