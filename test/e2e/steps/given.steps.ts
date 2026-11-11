import { defineParameterType, Given } from '@cucumber/cucumber';
import type CustomWorld from '@test/e2e/utils/world';

export enum APIConfigurations {
  InsecureHTTP = 'insecurely',
  InvalidAPIKey = 'with an invalid api key',
  MissingMTLS = 'with missing MTLS certificate',
  CorrectConfig = 'correctly',
}

defineParameterType({
  name: 'APIConfig',
  regexp: /insecurely|with an invalid api key|with missing MTLS certificate|correctly/,
  transformer: (s) => s as APIConfigurations,
});

Given(
  'my {word} client is configured {APIConfig}',
  function (this: CustomWorld, service: string, apiConfig: APIConfigurations) {
    const apiClients: Record<string, Record<string, () => CustomWorld['api']>> = {
      FLEX: {
        [APIConfigurations.InsecureHTTP]: () => this.flexAPIUsingInsecureProtocol,
        [APIConfigurations.InvalidAPIKey]: () => this.flexAPIWithoutAPIKey,
        [APIConfigurations.MissingMTLS]: () => {
          throw new Error('Flex API does not use mTLS certs');
        },
        [APIConfigurations.CorrectConfig]: () => this.flexAPI,
      },
      PSO: {
        [APIConfigurations.InsecureHTTP]: () => this.psoAPIUsingInsecureProtocol,
        [APIConfigurations.InvalidAPIKey]: () => this.psoAPIWithoutAPIKey,
        [APIConfigurations.MissingMTLS]: () => this.psoAPIWithoutMTLSCert,
        [APIConfigurations.CorrectConfig]: () => this.psoAPI,
      },
    };

    if (!apiClients[service]) throw new Error(`Unknown API service: ${service}`);
    if (!apiClients[service][apiConfig]) throw new Error(`Unknown API configuration: ${apiConfig}`);

    this.api = apiClients[service][apiConfig]();
  }
);
