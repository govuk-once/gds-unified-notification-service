/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

// Using relative over alias path for now until solution found
import { iocGetNotificationDynamoRepository } from '@common/ioc';
import { World } from '@cucumber/cucumber';
import { IMessage } from '@project/lambdas';
import { domainName, fetchApiKeys } from '@shared/credentials';
import { mockIMessageRecord_E2E } from '@test/mocks';
import { Agent, fetch as undiciFetch } from 'undici';
import { config } from '../../../infrastructure/cdk/config';
import { FetchErrorResponse, FetchResponse, FetchService } from '../../../src/common/services/FetchService';
import { FetchSigV4Service } from '../../../src/common/services/FetchSigV4Service';

process.env.POWERTOOLS_DEV = 'true';
process.env.POWERTOOLS_METRICS_DISABLED = 'false';

export default class CustomWorld extends World {
  public flexKeyMarker!: string;

  public psoAPI!: FetchService;
  public psoAPIWithoutAPIKey!: FetchService;
  public psoAPIWithoutMTLSCert!: FetchService;
  public psoAPIUsingInsecureProtocol!: FetchService;
  public flexAPI!: FetchSigV4Service;
  public flexAPIWithoutAPIKey!: FetchSigV4Service;
  public flexAPIUsingInsecureProtocol!: FetchService;

  public api!: FetchSigV4Service | FetchService;
  public path!: string;
  public result!: FetchResponse | FetchErrorResponse;

  public messageRequest?: Omit<IMessage, 'OrganisationID'>[];

  constructor(options: any) {
    super(options);
  }

  public knownTestIDs = {
    notificationID: '69aeaf44-1357-4053-99bc-b822b5df3f25',
    pushID:
      {
        dev: `7s1EVFj6JYNF4JA_ClmeArf06BdsABRhJhDKgPNuY0M`,
      }[config.env] ?? 'uns123',
  };

  public async applyDispatchConfig(httpsAgent: Agent) {
    const usePrivateGateway = config.isE2ERunner;
    this.flexKeyMarker = this.flexKeyMarker = usePrivateGateway ? 'private' : 'e2e';

    const psoUrl = await domainName(`pso`);
    const flexUrl = await domainName(`flex`, usePrivateGateway);

    const { psoApiKey, flexApiKey } = await fetchApiKeys(this.flexKeyMarker);

    this.psoAPI = new FetchService({
      baseUrl: `https://${psoUrl}`,
      defaultHeaders: {
        'x-api-key': psoApiKey,
      },
      defaultTimeout: 60000,
      fetchOptions: {
        dispatcher: httpsAgent,
      },
      fetchImpl: undiciFetch,
    });
    this.psoAPIWithoutAPIKey = new FetchService({
      baseUrl: `https://${psoUrl}`,
      defaultHeaders: {},
      defaultTimeout: 60000,
      fetchOptions: {
        dispatcher: httpsAgent,
      },
      fetchImpl: undiciFetch,
    });
    this.psoAPIWithoutMTLSCert = new FetchService({
      baseUrl: `https://${psoUrl}`,
      defaultHeaders: {
        'x-api-key': psoApiKey,
      },
      defaultTimeout: 60000,
    });
    this.psoAPIUsingInsecureProtocol = new FetchService({
      baseUrl: `http://${psoUrl}`,
      defaultHeaders: {},
      defaultTimeout: 60000,
    });
    this.flexAPI = new FetchSigV4Service({
      baseUrl: `https://${flexUrl}`,
      credentials: { region: config.region },
      defaultHeaders: {
        'x-api-key': flexApiKey,
      },
    });
    this.flexAPIWithoutAPIKey = new FetchSigV4Service({
      baseUrl: `https://${flexUrl}`,
      credentials: { region: config.region },
      defaultHeaders: {},
    });
    this.flexAPIUsingInsecureProtocol = new FetchService({
      baseUrl: `http://${flexUrl}`,
      defaultTimeout: 60000,
      defaultHeaders: {
        'x-api-key': psoApiKey,
      },
    });
  }

  public async createNotificationIfNotFound() {
    // Checks if a notification with the test ID already exists
    // If not then a notification record in dynamoDB with expected statuses
    const notificationsRepository = await iocGetNotificationDynamoRepository();
    const message = await notificationsRepository.getRecord(this.knownTestIDs.notificationID);

    if (message === null) {
      console.log('No message record found, creating a new message in message table');
      const messageRecord = mockIMessageRecord_E2E(this.knownTestIDs.notificationID, this.knownTestIDs.pushID);
      await notificationsRepository.createRecord(messageRecord);
    }
  }
}
