import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { Hash } from '@aws-sdk/hash-node';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { formatUrl } from '@aws-sdk/util-format-url';
import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils';
import { HttpRequest } from '@smithy/protocol-http';
import { createClient } from 'redis';

export class CacheService {
  public cache: ReturnType<typeof createClient>;
  constructor(
    protected config: ConfigurationService,
    public observability: ObservabilityService
  ) {}

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

  async connect() {
    const cacheName = await this.config.getParameter(StringParameters.Config.Cache.Name);
    const cacheHost = await this.config.getParameter(StringParameters.Config.Cache.Host);
    const cacheUser = await this.config.getParameter(StringParameters.Config.Cache.User);

    this.cache = createClient({
      password: await this.generateSigV4(cacheName, cacheUser),
      username: cacheUser,
      socket: {
        host: cacheHost,
        port: 6379,
        tls: true,
      },
    });
    await this.cache.connect();
    return this;
  }

  // Store any value by serializing it
  async store<T>(key: string, value: T) {
    await this.cache.set(key, JSON.stringify(value));
    return value;
  }

  // Fetch, deserialize, and typecast
  async get<T>(
    key: string,
    options?: {
      factory?: () => Promise<T> | T;
    }
  ): Promise<T | undefined> {
    const value = await this.cache.get(key);
    // Parse value to the expected T
    if (value) {
      return JSON.parse(value) as T;
    }

    // Fallback on storage if
    if (value == undefined && options?.factory !== undefined) {
      await this.store(key, await options.factory());
      return (await this.get<T>(key)) as T | undefined;
    }
    return undefined;
  }

  // Demo FN
  async counter() {
    const value = (await this.get<number>('counter', { factory: () => 0 })) as number;
    return await this.store(`counter`, value + 1);
  }

  async rateLimit(key: string, maxPerMinute: number, increment?: number) {
    const unixEpoch = new Date().getTime() / 1000;
    const roundedUnixEpoch = unixEpoch - (unixEpoch % 60);
    const rateLimitKey = `${key}:${roundedUnixEpoch}`;

    let counter: number;
    // If increment is not set - this function will just return
    if (increment == undefined) {
      counter = (await this.get(rateLimitKey, { factory: () => 0 })) ?? 0;
    } else {
      // Add to the counter - and ensure it expires in 60s
      counter = await this.cache.incrBy(rateLimitKey, increment);
      await this.cache.expire(rateLimitKey, 60);
    }
    const state = {
      exceeded: counter >= maxPerMinute,
      capacityRemaining: Math.max(0, counter - maxPerMinute),
    };
    this.observability.logger.info(`Rate limiting status`, {
      key,
      counter,
      maxPerMinute,
      percent: counter / maxPerMinute,
    });

    // Return whether the counter has rached the limit
    return state;
  }
}
