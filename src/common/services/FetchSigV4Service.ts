import { Sha256 } from '@aws-crypto/sha256-js';
import { FetchInputParameter, FetchOptionsParameter, FetchService } from '@common/services/FetchService';

import { fromNodeProviderChain, fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';
import type { AwsCredentialIdentityProvider } from '@smithy/types';

export class FetchSigV4Service extends FetchService {
  constructor(
    protected props: {
      baseUrl: string;
      defaultHeaders?: Record<string, string>;
      credentials: {
        roleArn?: string;
        externalId?: string;
        sessionName?: string;
        region: string;
        service?: string;
      };
    }
  ) {
    super(props);
  }

  getCredentialsProvider(roleArn?: string, externalId?: string, sessionName?: string): AwsCredentialIdentityProvider {
    if (roleArn) {
      return fromTemporaryCredentials({
        params: {
          RoleArn: roleArn,
          RoleSessionName: sessionName ?? 'UNS',
          ...(externalId && { ExternalId: externalId }),
        },
      });
    }

    return fromNodeProviderChain();
  }

  async fetch(url: FetchInputParameter, init?: FetchOptionsParameter): Promise<Response> {
    const { roleArn, externalId, region, sessionName } = this.props.credentials;

    const parsedUrl = new URL(url as string);
    const bodyString = init?.body ? JSON.stringify(init?.body) : undefined;

    const query: Record<string, string> = {};
    parsedUrl.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    const request = new HttpRequest({
      method: init?.method,
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : undefined,
      path: parsedUrl.pathname,
      query,
      headers: {
        host: parsedUrl.host,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: bodyString,
    });

    const signer = new SignatureV4({
      credentials: this.getCredentialsProvider(roleArn, externalId, sessionName),
      region: region,
      service: this.props.credentials.service ?? 'execute-api',
      sha256: Sha256,
    });

    const { headers } = await signer.sign(request);

    return await super.fetch(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        ...{
          Authorization: headers.authorization,
          'X-Amz-Date': headers['x-amz-date'],
          'X-Amz-Security-Token': headers['x-amz-security-token'],
          'X-Amz-Content-Sha256': headers['x-amz-content-sha256'],
          host: headers['host'],
        },
      },
    });
  }
}
