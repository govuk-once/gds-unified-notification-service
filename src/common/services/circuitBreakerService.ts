import { CacheService } from '@common/services/cacheService';
import { ConfigurationService } from '@common/services/configurationService';
import { ObservabilityService } from '@common/services/observabilityService';
import { NumericParameters } from '@common/utils';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreakerOpenError extends Error {
  constructor(platform: string) {
    super(`Circuit breaker is OPEN for platform: ${platform}`);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class CircuitBreakerService {
  constructor(
    private cacheService: CacheService,
    private config: ConfigurationService,
    private observability: ObservabilityService
  ) {}

  private stateKey(platform: string) {
    return `cb:${platform}:state`;
  }

  private failureKey(platform: string, windowKey: number) {
    return `cb:${platform}:failures:${windowKey}`;
  }

  private openedAtKey(platform: string) {
    return `cb:${platform}:opened_at`;
  }

  private rateLimitKey(platform: string, minuteKey: number) {
    return `cb:${platform}:rl:${minuteKey}`;
  }

  private currentWindowKey(windowDuration: number): number {
    const now = Math.floor(Date.now() / 1000);
    return now - (now % windowDuration);
  }

  private currentMinuteKey(): number {
    const now = Math.floor(Date.now() / 1000);
    return now - (now % 60);
  }

  async getState(platform: string): Promise<CircuitBreakerState> {
    return (await this.cacheService.get<CircuitBreakerState>(this.stateKey(platform))) ?? 'CLOSED';
  }

  /**
   * Checks the circuit state and throws CircuitBreakerOpenError if the circuit is blocking requests.
   * - CLOSED: allows all requests; opens if failure threshold is reached within the window
   * - OPEN: blocks requests until halfOpenAfter seconds have elapsed, then transitions to HALF_OPEN
   * - HALF_OPEN: allows limited requests (rateLimitWhenOpen per minute) to probe for recovery
   */
  async checkCircuit(platform: string): Promise<void> {
    const [threshold, windowDuration, halfOpenAfter, rateLimitWhenOpen] = await Promise.all([
      this.config.getNumericParameter(NumericParameters.CircuitBreaker.Threshold),
      this.config.getNumericParameter(NumericParameters.CircuitBreaker.WindowDuration),
      this.config.getNumericParameter(NumericParameters.CircuitBreaker.HalfOpenAfter),
      this.config.getNumericParameter(NumericParameters.CircuitBreaker.RateLimitWhenOpen),
    ]);

    const state = await this.getState(platform);
    this.observability.logger.info('Circuit breaker check', { platform, state });

    if (state === 'OPEN') {
      const openedAt = (await this.cacheService.get<number>(this.openedAtKey(platform))) ?? 0;
      const now = Math.floor(Date.now() / 1000);

      if (now - openedAt >= halfOpenAfter) {
        await this.cacheService.store(this.stateKey(platform), 'HALF_OPEN' as CircuitBreakerState);
        this.observability.logger.info('Circuit breaker transitioned to HALF_OPEN', { platform });
        await this.enforceRateLimit(platform, rateLimitWhenOpen);
      } else {
        throw new CircuitBreakerOpenError(platform);
      }
      return;
    }

    if (state === 'HALF_OPEN') {
      await this.enforceRateLimit(platform, rateLimitWhenOpen);
      return;
    }

    // CLOSED — check if accumulated failures should open the circuit
    const windowKey = this.currentWindowKey(windowDuration);
    const failureCount = (await this.cacheService.get<number>(this.failureKey(platform, windowKey))) ?? 0;
    if (failureCount >= threshold) {
      await this.transitionToOpen(platform);
      throw new CircuitBreakerOpenError(platform);
    }
  }

  /**
   * Records a successful dispatch. Transitions HALF_OPEN → CLOSED.
   */
  async recordSuccess(platform: string): Promise<void> {
    const state = await this.getState(platform);
    if (state === 'HALF_OPEN') {
      await this.cacheService.store(this.stateKey(platform), 'CLOSED' as CircuitBreakerState);
      this.observability.logger.info('Circuit breaker closed after successful request in HALF_OPEN state', {
        platform,
      });
    }
  }

  /**
   * Records a failed dispatch.
   * - CLOSED: increments the failure counter; opens the circuit when threshold is reached
   * - HALF_OPEN: transitions back to OPEN immediately
   */
  async recordFailure(platform: string): Promise<void> {
    const [threshold, windowDuration] = await Promise.all([
      this.config.getNumericParameter(NumericParameters.CircuitBreaker.Threshold),
      this.config.getNumericParameter(NumericParameters.CircuitBreaker.WindowDuration),
    ]);

    const windowKey = this.currentWindowKey(windowDuration);
    const newCount = await this.cacheService.increment(this.failureKey(platform, windowKey), windowDuration);

    this.observability.logger.warn('Circuit breaker failure recorded', { platform, failureCount: newCount, threshold });

    const state = await this.getState(platform);

    if (state === 'HALF_OPEN') {
      await this.transitionToOpen(platform);
      return;
    }

    if (state === 'CLOSED' && newCount >= threshold) {
      await this.transitionToOpen(platform);
    }
  }

  private async transitionToOpen(platform: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await Promise.all([
      this.cacheService.store(this.stateKey(platform), 'OPEN' as CircuitBreakerState),
      this.cacheService.store(this.openedAtKey(platform), now),
    ]);
    this.observability.logger.warn('Circuit breaker opened', { platform, openedAt: now });
  }

  private async enforceRateLimit(platform: string, rateLimitWhenOpen: number): Promise<void> {
    const minuteKey = this.currentMinuteKey();
    const count = await this.cacheService.increment(this.rateLimitKey(platform, minuteKey), 60);

    this.observability.logger.info('Circuit breaker rate limit check (OPEN/HALF_OPEN)', {
      platform,
      count,
      limit: rateLimitWhenOpen,
    });

    if (count > rateLimitWhenOpen) {
      throw new CircuitBreakerOpenError(platform);
    }
  }
}
