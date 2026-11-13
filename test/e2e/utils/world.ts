/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

// Using relative over alias path for now until solution found
import { iocGetNotificationDynamoRepository } from '@common/ioc';
import { IMessage } from '@common/models/interfaces';
import { FetchSigV4Service } from '@common/services/FetchSigV4Service';
import { World } from '@cucumber/cucumber';
import { config } from '@infra/cdk/config';
import { ApiKeys, Domains } from '@shared/credentials';
import { mockIMessageRecord_E2E } from '@test/mocks';
import { Agent, fetch as undiciFetch } from 'undici';
import { FetchErrorResponse, FetchResponse, FetchService } from '@common/services/FetchService';
import { v4 as uuid } from 'uuid';

process.env.POWERTOOLS_LOG_LEVEL = 'ERROR';
process.env.LOG_LEVEL = 'error';

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
  public pushIdState: string = 'valid';
  public notificationState: string = 'existing';

  public pushId!: string;
  public expectedStatusCode?: number;
  public expectedResponseBody?: unknown;
  public method!: string;
  public path!: string;
  public result!: FetchResponse | FetchErrorResponse | undefined;

  public messageRequest?: Omit<IMessage, 'OrganisationID'>[];
  public cleanups: (() => Promise<void>)[] = [];

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

  public applyDispatchConfig(httpsAgent: Agent, apiKey: ApiKeys, domains: Domains) {
    this.psoAPI = new FetchService({
      baseUrl: `https://${domains.pso}`,
      defaultHeaders: {
        'x-api-key': apiKey.psoApiKey,
      },
      defaultTimeout: 60000,
      fetchOptions: {
        dispatcher: httpsAgent,
      },
      fetchImpl: undiciFetch,
    });
    this.psoAPIWithoutAPIKey = new FetchService({
      baseUrl: `https://${domains.pso}`,
      defaultHeaders: {},
      defaultTimeout: 60000,
      fetchOptions: {
        dispatcher: httpsAgent,
      },
      fetchImpl: undiciFetch,
    });
    this.psoAPIWithoutMTLSCert = new FetchService({
      baseUrl: `https://${domains.pso}`,
      defaultHeaders: {
        'x-api-key': apiKey.psoApiKey,
      },
      defaultTimeout: 60000,
    });
    this.psoAPIUsingInsecureProtocol = new FetchService({
      baseUrl: `http://${domains.pso}`,
      defaultHeaders: {},
      defaultTimeout: 60000,
    });
    this.flexAPI = new FetchSigV4Service({
      baseUrl: `https://${domains.flex}`,
      credentials: { region: config.region },
      defaultHeaders: {
        'x-api-key': apiKey.flexApiKey,
      },
    });
    this.flexAPIWithoutAPIKey = new FetchSigV4Service({
      baseUrl: `https://${domains.flex}`,
      credentials: { region: config.region },
      defaultHeaders: {},
    });
    this.flexAPIUsingInsecureProtocol = new FetchService({
      baseUrl: `http://${domains.flex}`,
      defaultTimeout: 60000,
      defaultHeaders: {
        'x-api-key': apiKey.flexApiKey,
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

  public resolvePushID(): string {
    const states: Record<string, string> = {
      valid: this.knownTestIDs.pushID,
      "wrong user's": uuid(),
      missing: '',
    };
    const value = states[this.pushIdState];
    if (value === undefined) throw new Error(`Invalid push ID state: ${this.pushIdState}`);
    return value;
  }

  public resolveNotificationID(): string {
    const states: Record<string, string> = {
      existing: this.knownTestIDs.notificationID,
      unknown: uuid(),
    };
    const value = states[this.notificationState];
    if (value === undefined) throw new Error(`Invalid notification state: ${this.notificationState}`);
    return value;
  }

  public async sendRequest(method: string, body?: unknown) {
    this.method = method;
    try {
      switch (method) {
        case 'POST':
          this.result = await this.api.post({ path: this.path, body });
          break;
        case 'GET':
          this.result = await this.api.get({ path: this.path });
          break;
        case 'DELETE':
          this.result = await this.api.delete({ path: this.path });
          break;
        case 'PUT':
          this.result = await this.api.put({ path: this.path, body });
          break;
      }
    } catch (e) {
      this.result = e as FetchErrorResponse;
    }
  }
}
