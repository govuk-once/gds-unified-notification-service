import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { CircuitBreakerStateEnum } from '@common/models/CircuitBreakerStateEnum';
import { CacheService } from '@common/services/cacheService';
import { ConfigurationService } from '@common/services/configurationService';
import { ObservabilityService } from '@common/services/observabilityService';
import { NumericParameters } from '@common/utils';

export class CircuitBreakerOpenError extends Error {
  constructor(platform: string) {
    super(`Circuit breaker is OPEN for platform: ${platform}`);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class CircuitBreakerService {
  constructor(
    private observability: ObservabilityService,
    private config: ConfigurationService,
    private cacheService: CacheService,
    private platform: string
  ) {
    this.observability.metrics.addMetric('RATE_LIMITING_ENABLED', MetricUnit.NoUnit, 0);
    this.observability.metrics.addMetric('CIRCUIT_BREAKER_STATE', MetricUnit.NoUnit, 0);
  }

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

  async getState(): Promise<CircuitBreakerStateEnum> {
    return (
      (await this.cacheService.get<CircuitBreakerStateEnum>(this.stateKey(this.platform))) ??
      CircuitBreakerStateEnum.CLOSED
    );
  }

  /**
   * Checks the circuit state and throws CircuitBreakerOpenError if the circuit is blocking requests.
   * - CLOSED: allows all requests; opens if failure threshold is reached within the window
   * - OPEN: blocks requests until halfOpenAfter seconds have elapsed, then transitions to HALF_OPEN
   * - HALF_OPEN: allows limited requests (rateLimitWhenOpen per minute) to probe for recovery
   */
  async checkCircuit(): Promise<void> {
    const [threshold, windowDuration, halfOpenAfter, rateLimitWhenOpen] = await Promise.all([
      this.config.getNumericParameter(NumericParameters.CircuitBreaker.Threshold),
      this.config.getNumericParameter(NumericParameters.CircuitBreaker.WindowDuration),
      this.config.getNumericParameter(NumericParameters.CircuitBreaker.HalfOpenAfter),
      this.config.getNumericParameter(NumericParameters.CircuitBreaker.RateLimitWhenOpen),
    ]);

    const state = await this.getState();
    this.observability.logger.info('Circuit breaker check', { platform: this.platform, state });

    if (state == CircuitBreakerStateEnum.OPEN) {
      this.observability.metrics.addMetric('CIRCUIT_BREAKER_STATE', MetricUnit.NoUnit, 1);
      const openedAt = (await this.cacheService.get<number>(this.openedAtKey(this.platform))) ?? 0;
      const now = Math.floor(Date.now() / 1000);

      if (now - openedAt >= halfOpenAfter) {
        await this.cacheService.store(this.stateKey(this.platform), 'HALF_OPEN' as CircuitBreakerStateEnum);
        this.observability.logger.info('Circuit breaker transitioned to HALF_OPEN', { platform: this.platform });
        await this.enforceRateLimit(rateLimitWhenOpen);
      } else {
        throw new CircuitBreakerOpenError(this.platform);
      }
      return;
    }

    if (state == CircuitBreakerStateEnum.HALF_OPEN) {
      await this.enforceRateLimit(rateLimitWhenOpen);
      return;
    }

    // CLOSED — check if accumulated failures should open the circuit
    const count = await this.getCurrentRate();
    this.observability.metrics.addMetric('CURRENT_RATE', MetricUnit.CountPerSecond, count);
    this.observability.metrics.addMetric('CIRCUIT_BREAKER_STATE', MetricUnit.NoUnit, 0);

    const windowKey = this.currentWindowKey(windowDuration);
    const failureCount = (await this.cacheService.get<number>(this.failureKey(this.platform, windowKey))) ?? 0;
    if (failureCount >= threshold) {
      await this.transitionToOpen();
      throw new CircuitBreakerOpenError(this.platform);
    }
  }

  /**
   * Records a successful dispatch. Transitions HALF_OPEN → CLOSED.
   */
  async recordSuccess(): Promise<void> {
    const state = await this.getState();
    if (state == CircuitBreakerStateEnum.HALF_OPEN) {
      await this.cacheService.store(
        this.stateKey(this.platform),
        CircuitBreakerStateEnum.CLOSED as CircuitBreakerStateEnum
      );
      this.observability.metrics.addMetric('CIRCUIT_BREAKER_SUCCESS', MetricUnit.Count, 1);
      this.observability.logger.info('Circuit breaker closed after successful request in HALF_OPEN state', {
        platform: this.platform,
      });
    }
  }

  /**
   * Records a failed dispatch.
   * - CLOSED: increments the failure counter; opens the circuit when threshold is reached
   * - HALF_OPEN: transitions back to OPEN immediately
   */
  async recordFailure(): Promise<void> {
    const [threshold, windowDuration] = await Promise.all([
      this.config.getNumericParameter(NumericParameters.CircuitBreaker.Threshold),
      this.config.getNumericParameter(NumericParameters.CircuitBreaker.WindowDuration),
    ]);

    const windowKey = this.currentWindowKey(windowDuration);
    const newCount = await this.cacheService.increment(this.failureKey(this.platform, windowKey), windowDuration);

    this.observability.metrics.addMetric('CIRCUIT_BREAKER_FAILURE', MetricUnit.Count, 1);
    this.observability.logger.warn('Circuit breaker failure recorded', {
      platform: this.platform,
      failureCount: newCount,
      threshold,
    });

    const state = await this.getState();

    if (state == CircuitBreakerStateEnum.HALF_OPEN) {
      await this.transitionToOpen();
      return;
    }

    if (state == CircuitBreakerStateEnum.CLOSED && newCount >= threshold) {
      await this.transitionToOpen();
    }
  }

  private async transitionToOpen(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await Promise.all([
      this.cacheService.store(this.stateKey(this.platform), CircuitBreakerStateEnum.OPEN as CircuitBreakerStateEnum),
      this.cacheService.store(this.openedAtKey(this.platform), now),
    ]);
    this.observability.logger.warn('Circuit breaker opened', { platform: this.platform, openedAt: now });
  }

  /**
   * Wraps an async operation with circuit breaker protection.
   * Handles checkCircuit, recordSuccess, and recordFailure automatically.
   */
  async use<T>(
    fn: () => Promise<T>
  ): Promise<{ result?: T; error?: unknown; circuitBreakerState: CircuitBreakerStateEnum }> {
    try {
      await this.checkCircuit();
      const result = await fn();
      return { result: result, circuitBreakerState: await this.getState() };
    } catch (error) {
      if (!(error instanceof CircuitBreakerOpenError)) {
        await this.recordFailure();
      }
      return { error: error, circuitBreakerState: await this.getState() };
    }
  }

  private async enforceRateLimit(rateLimitWhenOpen: number): Promise<void> {
    const count = await this.getCurrentRate();

    this.observability.metrics.addMetric('CURRENT_RATE', MetricUnit.CountPerSecond, count);
    this.observability.metrics.addMetric('RATE_LIMITING_ENABLED', MetricUnit.NoUnit, 1);
    this.observability.logger.info('Circuit breaker rate limit check (OPEN/HALF_OPEN)', {
      platform: this.platform,
      count,
      limit: rateLimitWhenOpen,
    });

    if (count > rateLimitWhenOpen) {
      throw new CircuitBreakerOpenError(this.platform);
    }
  }

  private async getCurrentRate(): Promise<number> {
    const minuteKey = this.currentMinuteKey();
    const count = await this.cacheService.increment(this.rateLimitKey(this.platform, minuteKey), 60);

    return count;
  }
}
