import { defineParameterType, Given } from '@cucumber/cucumber';
import { e2eUUID } from '@test/e2e/helpers/uuid';
import CustomWorld from '@test/e2e/support/world';

export const APIConfigurations = {
  InsecureHTTP: 'the connection is insecure',
  InvalidAPIKey: 'my API key is invalid',
  MissingMTLS: 'with missing MTLS certificate',
  CorrectConfig: 'correctly',
} as const;

type APIConfigurations = (typeof APIConfigurations)[keyof typeof APIConfigurations];

defineParameterType({
  name: 'APIConfig',
  regexp: new RegExp(Object.values(APIConfigurations).join('|')),
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
      [APIConfigurations.CorrectConfig]: () => world.psoAPI,
    },
  };

  if (!apiClients[client]) throw new Error(`Unknown API service: ${client}`);
  if (!apiClients[client][apiConfig]) throw new Error(`Unknown API configuration: ${apiConfig}`);

  world.api = apiClients[client][apiConfig]();
};

Given('a correctly configured {word} client', function (this: CustomWorld, client: string) {
  configureClient(this, client, APIConfigurations.CorrectConfig);
  this.clientName = client;
});

// ──────────────────────────────────────────────────
// But — these steps are only used after a 'But' in
// a feature file, to override the Given above.
// ──────────────────────────────────────────────────

Given('{APIConfig}', function (this: CustomWorld, apiConfig: APIConfigurations) {
  if (!this.clientName) throw new Error('Configure a client first using "a correctly configured {client} client"');
  configureClient(this, this.clientName, apiConfig);
});

Given('my push ID is missing', function (this: CustomWorld) {
  this.pushID = '';
});

Given('the push ID belongs to another user', function (this: CustomWorld) {
  this.pushID = e2eUUID('wrong');
});

Given('my MTLS certificate is missing', function (this: CustomWorld) {
  this.api = this.psoAPIWithoutMTLSCert;
});
