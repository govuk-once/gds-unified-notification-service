import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { Hash } from '@aws-sdk/hash-node';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { formatUrl } from '@aws-sdk/util-format-url';
import { Configuration } from '@common/services/configuration';
import { HttpRequest } from '@smithy/protocol-http';
import { createClient } from 'redis';

export class CacheService {
  public cache: ReturnType<typeof createClient>;
  protected cacheName: string = ``;
  protected cacheHost: string = ``;
  protected cacheUser: string = ``;
  constructor(protected config: Configuration) {}

  async generateSigV4(cacheName: string, username: string) {
    const credentials = fromNodeProviderChain();
    const protocol = 'https:';

    return formatUrl(
      await new SignatureV4({
        service: 'elasticache',
        region: 'eu-west-2',
        credentials: credentials,
        sha256: Hash.bind(null, 'sha256'),
      }).presign(
        new HttpRequest({
          method: 'GET',
          protocol: protocol,
          hostname: cacheName,
          query: {
            Action: 'connect',
            User: username,
            ResourceType: 'ServerlessCache',
          },
          headers: {
            host: cacheName,
          },
        }),
        {
          expiresIn: 900,
        }
      )
    ).replace(`${protocol}//`, '');
  }

  async initialize() {
    this.cache = createClient({
      password: await this.generateSigV4(this.cacheName, this.cacheUser),
      username: this.cacheUser,
      socket: {
        host: this.cacheHost,
        port: 6379,
        tls: true,
      },
    });
    await this.cache.connect();
    return this;
  }

  async counter() {
    const value = await this.cache.get('counter');
    const intValue = value == null ? 1 : parseInt(value, 10);
    const newValue = intValue + 1;
    await this.cache.set(`counter`, newValue);
    return newValue;
  }
}
