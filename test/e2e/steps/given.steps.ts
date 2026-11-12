import { defineParameterType, Given } from '@cucumber/cucumber';
import type CustomWorld from '@test/e2e/utils/world';

export enum APIConfigurations {
  InsecureHTTP = 'the connection is insecure',
  InvalidAPIKey = 'my API key is invalid',
  MissingMTLS = 'with missing MTLS certificate',
  CorrectConfig = 'correctly',
}

defineParameterType({
  name: 'APIConfig',
  regexp: /the connection is insecure|my API key is invalid|with missing MTLS certificate|correctly/,
  transformer: (s) => s as APIConfigurations,
});

const configureClient = (world: CustomWorld, client: string, apiConfig: APIConfigurations) => {
  const apiClients: Record<string, Record<string, () => CustomWorld['api']>> = {
    FLEX: {
      [APIConfigurations.InsecureHTTP]: () => world.flexAPIUsingInsecureProtocol,
      [APIConfigurations.InvalidAPIKey]: () => world.flexAPIWithoutAPIKey,
      [APIConfigurations.MissingMTLS]: () => {
        throw new Error('Flex API does not use mTLS certs');
      },
      [APIConfigurations.CorrectConfig]: () => world.flexAPI,
    },
    PSO: {
      [APIConfigurations.InsecureHTTP]: () => world.psoAPIUsingInsecureProtocol,
      [APIConfigurations.InvalidAPIKey]: () => world.psoAPIWithoutAPIKey,
      [APIConfigurations.MissingMTLS]: () => world.psoAPIWithoutMTLSCert,
      [APIConfigurations.CorrectConfig]: () => world.psoAPI,
    },
  };

  if (!apiClients[client]) throw new Error(`Unknown API service: ${client}`);
  if (!apiClients[client][apiConfig]) throw new Error(`Unknown API configuration: ${apiConfig}`);

  world.api = apiClients[client][apiConfig]();
};
let clientName: string | undefined;
Given('a correctly configured {word} client', function (this: CustomWorld, client: string) {
  configureClient(this, client, APIConfigurations.CorrectConfig);
  clientName = client;
});
// ──────────────────────────────────────────────────
// But — these steps are only used after a 'But' in
// a feature file, to override the Given above.
// ──────────────────────────────────────────────────

Given('{APIConfig}', function (this: CustomWorld, apiConfig: APIConfigurations) {
  if (!clientName) throw new Error('Configure a client first using "a correctly configured {client} client"');
  configureClient(this, clientName, apiConfig);
});

Given('my push ID is missing', function (this: CustomWorld) {
  this.pushIdState = 'missing';
});

Given('the push ID belongs to another user', function (this: CustomWorld) {
  this.pushIdState = "wrong user's";
});

Given('the notification does not exist', function (this: CustomWorld) {
  this.notificationState = 'unknown';
});

Given('my MTLS certificate is missing', function (this: CustomWorld) {
  this.api = this.psoAPIWithoutMTLSCert;
});
