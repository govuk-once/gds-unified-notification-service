/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { FetchSigV4Service } from '@common/services/FetchSigV4Service';
import { World } from '@cucumber/cucumber';
import { config } from '@infra/cdk/config';
import { ApiKeys, Domains } from '@shared/credentials';
import { Agent, fetch as undiciFetch } from 'undici';
import { FetchErrorResponse, FetchResponse, FetchService } from '@common/services/FetchService';

process.env.POWERTOOLS_LOG_LEVEL = 'ERROR';
process.env.LOG_LEVEL = 'error';

export default class CustomWorld extends World {
  public flexKeyMarker!: string;
  public clientName!: string;

  public psoAPI!: FetchService;
  public psoAPIWithoutAPIKey!: FetchService;
  public psoAPIWithoutMTLSCert!: FetchService;
  public psoAPIUsingInsecureProtocol!: FetchService;
  public flexAPI!: FetchSigV4Service;
  public flexAPIWithoutAPIKey!: FetchSigV4Service;
  public flexAPIUsingInsecureProtocol!: FetchService;

  public api!: FetchSigV4Service | FetchService;

  public pushID!: string;
  public groupPushIDs: string[] = [];
  public campaignID!: string;
  public notificationID!: string;
  public notificationIDs: string[] = [];
  public expectedStatusCode?: number;
  public assertions: ((body: unknown) => void | Promise<void>)[] = [];
  public method!: string;
  public path!: string;
  public result!: FetchResponse | FetchErrorResponse | undefined;

  public cleanups: (() => Promise<void>)[] = [];

  constructor(options: any) {
    super(options);
  }

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
        case 'PATCH':
          this.result = await this.api.patch({ path: this.path, body });
          break;
      }
    } catch (e) {
      this.result = e as FetchErrorResponse;
    }
  }
}
