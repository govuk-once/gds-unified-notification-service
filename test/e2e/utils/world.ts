/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

// Using relative over alias path for now until solution found
import { World } from '@cucumber/cucumber';
import { IMessage } from '@project/lambdas';
import { config } from '../../../infrastructure/cdk/config';
import { FetchResponse, FetchService } from '../../../src/common/services/FetchService';
import { FetchSigV4Service } from '../../../src/common/services/FetchSigV4Service';
import { domainName, prepareDispatchConfig } from '../utils/setup.e2e';

process.env.POWERTOOLS_DEV = 'true';
process.env.POWERTOOLS_METRICS_DISABLED = 'false';

export default class CustomWorld extends World {
  public psoUrl: string;
  public flexUrl: string;
  public flexKeyMarker: string;

  public psoAPI!: FetchService;
  public psoAPIWithoutAPIKey!: FetchService;
  public psoAPIWithoutMTLSCert!: FetchService;
  public psoAPIUsingInsecureProtocol!: FetchService;
  public flexAPI!: FetchSigV4Service;
  public flexAPIWithoutAPIKey!: FetchSigV4Service;
  public flexAPIUsingInsecureProtocol!: FetchService;

  public api!: FetchSigV4Service | FetchService;
  public notificationID?: string;
  public pushID?: string;
  public path!: string;
  public result!: Promise<FetchResponse>;

  public messageRequest?: Omit<IMessage, 'OrganisationID'>[];

  constructor(options: any) {
    super(options);

    // Initialize pso and flex urls
    const usePrivateGateway = config.isE2ERunner;
    this.psoUrl = domainName(`pso`);
    this.flexUrl = domainName(`flex`, usePrivateGateway);
    this.flexKeyMarker = usePrivateGateway ? 'private' : 'e2e';
  }

  public testIDs = {
    mockNotificationID: {
      valid: 'd4e04ac4-5696-45b7-8e8c-0060883a84f5',
      notFound: 'unknown-notification-id',
    },
    pushID: 'abc123',
    validPushID:
      {
        dev: `7s1EVFj6JYNF4JA_ClmeArf06BdsABRhJhDKgPNuY0M`,
      }[config.env] ?? 'cde456',
  };

  public applyDispatchConfig(dispatchConfig: Awaited<ReturnType<typeof prepareDispatchConfig>>) {
    this.psoAPI = new FetchService({
      baseUrl: `https://${this.psoUrl}`,
      defaultHeaders: {
        'x-api-key': dispatchConfig.psoApiKey,
      },
      defaultTimeout: 60000,
      fetchOptions: {
        dispatcher: dispatchConfig.httpsAgent as unknown as never,
      },
    });
    this.psoAPIWithoutAPIKey = new FetchService({
      baseUrl: `https://${this.psoUrl}`,
      defaultHeaders: {},
      defaultTimeout: 60000,
      fetchOptions: {
        dispatcher: dispatchConfig.httpsAgent as unknown as never,
      },
    });
    this.psoAPIWithoutMTLSCert = new FetchService({
      baseUrl: `https://${this.psoUrl}`,
      defaultHeaders: {
        'x-api-key': dispatchConfig.psoApiKey,
      },
      defaultTimeout: 60000,
    });
    this.psoAPIUsingInsecureProtocol = new FetchService({
      baseUrl: `http://${this.psoUrl}`,
      defaultHeaders: {},
      defaultTimeout: 60000,
    });
    this.flexAPI = new FetchSigV4Service({
      baseUrl: `https://${this.flexUrl}`,
      credentials: { region: config.region },
      defaultHeaders: {
        'x-api-key': dispatchConfig.flexApiKey,
      },
    });
    this.flexAPIWithoutAPIKey = new FetchSigV4Service({
      baseUrl: `https://${this.flexUrl}`,
      credentials: { region: config.region },
      defaultHeaders: {},
    });
    this.flexAPIUsingInsecureProtocol = new FetchService({
      baseUrl: `http://${this.flexUrl}`,
      defaultTimeout: 60000,
      defaultHeaders: {
        'x-api-key': dispatchConfig.psoApiKey,
      },
      fetchOptions: {
        dispatcher: dispatchConfig.httpsAgent as unknown as never,
      },
    });
  }
}
