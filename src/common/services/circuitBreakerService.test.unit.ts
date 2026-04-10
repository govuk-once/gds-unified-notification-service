/* eslint-disable @typescript-eslint/unbound-method */
import { CircuitBreakerStateEnum } from '@common/models/CircuitBreakerStateEnum';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { NumericParameters } from '@common/utils/parameters';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });

import { CircuitBreakerOpenError, CircuitBreakerService } from '@common/services';

describe('CircuitBreakerService', () => {
  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);

  let mockParameterStore = mockDefaultConfig();
  let service: CircuitBreakerService;

  const PLATFORM = 'test_platform';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    // Default cache behaviour: nothing stored
    serviceMocks.cacheServiceMock.get.mockResolvedValue(undefined);
    serviceMocks.cacheServiceMock.store.mockResolvedValue(undefined);
    serviceMocks.cacheServiceMock.increment.mockResolvedValue(1);

    service = new CircuitBreakerService(
      observabilityMocks,
      serviceMocks.configurationServiceMock,
      serviceMocks.cacheServiceMock,
      PLATFORM
    );
  });

  describe('getState', () => {
    it('should return CLOSED when no state is stored', async () => {
      serviceMocks.cacheServiceMock.get.mockResolvedValue(undefined);
      const state = await service.getState();
      expect(state).toBe('CLOSED');
    });

    it('should return the stored state', async () => {
      serviceMocks.cacheServiceMock.get.mockResolvedValue(CircuitBreakerStateEnum.OPEN as CircuitBreakerStateEnum);
      const state = await service.getState();
      expect(state).toBe('OPEN');
    });
  });

  describe('checkCircuit — CLOSED state', () => {
    it('should allow request when failure count is below threshold', async () => {
      // Arrange: no failures stored, default CLOSED state
      serviceMocks.cacheServiceMock.get.mockImplementation((key: string) => {
        if (key.includes(':state')) return Promise.resolve(undefined); // CLOSED
        if (key.includes(':failures:')) return Promise.resolve(2); // below threshold of 5
        return Promise.resolve(undefined);
      });

      // Act & Assert — should not throw
      await expect(service.checkCircuit()).resolves.toBeUndefined();
    });

    it('should open the circuit and throw when failure count meets threshold', async () => {
      // Arrange: failure count at threshold
      serviceMocks.cacheServiceMock.get.mockImplementation((key: string) => {
        if (key.includes(':state')) return Promise.resolve(undefined); // CLOSED
        if (key.includes(':failures:')) return Promise.resolve(5); // equals threshold
        return Promise.resolve(undefined);
      });

      // Act & Assert
      await expect(service.checkCircuit()).rejects.toThrow(CircuitBreakerOpenError);
      expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledWith(
        expect.stringContaining(':state'),
        CircuitBreakerStateEnum.OPEN
      );
    });
  });

  describe('checkCircuit — OPEN state', () => {
    it('should throw CircuitBreakerOpenError when within halfOpenAfter window', async () => {
      // Arrange: OPEN, opened 5s ago, halfOpenAfter is 30s
      vi.useFakeTimers();
      const now = 1000000;
      vi.setSystemTime(now * 1000);

      serviceMocks.cacheServiceMock.get.mockImplementation((key: string) => {
        if (key.includes(':state')) return Promise.resolve('OPEN' as CircuitBreakerStateEnum);
        if (key.includes(':opened_at')) return Promise.resolve(now - 5); // 5s ago, within halfOpenAfter (30s)
        return Promise.resolve(undefined);
      });

      // Act & Assert
      await expect(service.checkCircuit()).rejects.toThrow(CircuitBreakerOpenError);
    });

    it('should transition to HALF_OPEN and enforce rate limit after halfOpenAfter elapses', async () => {
      // Arrange: OPEN, opened 35s ago (past halfOpenAfter of 30s), rate limit not exceeded
      vi.useFakeTimers();
      const now = 1000000;
      vi.setSystemTime(now * 1000);

      serviceMocks.cacheServiceMock.get.mockImplementation((key: string) => {
        if (key.includes(':state')) return Promise.resolve(CircuitBreakerStateEnum.OPEN as CircuitBreakerStateEnum);
        if (key.includes(':opened_at')) return Promise.resolve(now - 35); // 35s ago
        return Promise.resolve(undefined);
      });
      serviceMocks.cacheServiceMock.increment.mockResolvedValue(1); // first request, under limit of 5

      // Act & Assert — should not throw
      await expect(service.checkCircuit()).resolves.toBeUndefined();
      expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledWith(
        expect.stringContaining(':state'),
        CircuitBreakerStateEnum.HALF_OPEN
      );
    });

    it('should throw when rate limit is exceeded during OPEN → HALF_OPEN transition', async () => {
      // Arrange: OPEN, past halfOpenAfter, but rate limit exceeded
      vi.useFakeTimers();
      const now = 1000000;
      vi.setSystemTime(now * 1000);

      serviceMocks.cacheServiceMock.get.mockImplementation((key: string) => {
        if (key.includes(':state')) return Promise.resolve(CircuitBreakerStateEnum.OPEN as CircuitBreakerStateEnum);
        if (key.includes(':opened_at')) return Promise.resolve(now - 35);
        return Promise.resolve(undefined);
      });
      serviceMocks.cacheServiceMock.increment.mockResolvedValue(6); // exceeds rateLimitWhenOpen (5)

      // Act & Assert
      await expect(service.checkCircuit()).rejects.toThrow(CircuitBreakerOpenError);
    });
  });

  describe('checkCircuit — HALF_OPEN state', () => {
    it('should allow request when under rate limit', async () => {
      // Arrange: HALF_OPEN, under rate limit
      serviceMocks.cacheServiceMock.get.mockImplementation((key: string) => {
        if (key.includes(':state'))
          return Promise.resolve(CircuitBreakerStateEnum.HALF_OPEN as CircuitBreakerStateEnum);
        return Promise.resolve(undefined);
      });
      serviceMocks.cacheServiceMock.increment.mockResolvedValue(3); // under limit of 5

      // Act & Assert — should not throw
      await expect(service.checkCircuit()).resolves.toBeUndefined();
    });

    it('should throw when rate limit is exceeded in HALF_OPEN state', async () => {
      // Arrange: HALF_OPEN, rate limit exceeded
      serviceMocks.cacheServiceMock.get.mockImplementation((key: string) => {
        if (key.includes(':state'))
          return Promise.resolve(CircuitBreakerStateEnum.HALF_OPEN as CircuitBreakerStateEnum);
        return Promise.resolve(undefined);
      });
      serviceMocks.cacheServiceMock.increment.mockResolvedValue(6); // exceeds limit of 5

      // Act & Assert
      await expect(service.checkCircuit()).rejects.toThrow(CircuitBreakerOpenError);
    });
  });

  describe('recordSuccess', () => {
    it('should not change state when circuit is CLOSED', async () => {
      // Arrange: CLOSED
      serviceMocks.cacheServiceMock.get.mockResolvedValue(undefined);

      // Act
      await service.recordSuccess();

      // Assert
      expect(serviceMocks.cacheServiceMock.store).not.toHaveBeenCalled();
    });

    it('should transition HALF_OPEN → CLOSED on success', async () => {
      serviceMocks.cacheServiceMock.get.mockResolvedValue(CircuitBreakerStateEnum.HALF_OPEN as CircuitBreakerStateEnum);

      await service.recordSuccess();

      expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledWith(
        expect.stringContaining(':state'),
        CircuitBreakerStateEnum.CLOSED
      );
    });
  });

  describe('recordFailure', () => {
    it('should increment the failure counter when CLOSED and stay CLOSED below threshold', async () => {
      // Arrange: CLOSED, increment returns 2 (below threshold 5)
      serviceMocks.cacheServiceMock.increment.mockResolvedValue(2);
      serviceMocks.cacheServiceMock.get.mockImplementation((key: string) => {
        if (key.includes(':state')) return Promise.resolve(undefined); // CLOSED
        return Promise.resolve(undefined);
      });

      await service.recordFailure();

      expect(serviceMocks.cacheServiceMock.increment).toHaveBeenCalledWith(
        expect.stringContaining(':failures:'),
        60 // windowDuration from default config
      );
      expect(serviceMocks.cacheServiceMock.store).not.toHaveBeenCalled();
    });

    it('should open the circuit when failure count meets threshold', async () => {
      // Arrange: CLOSED, increment returns 5 (equals threshold)
      serviceMocks.cacheServiceMock.increment.mockResolvedValue(5);
      serviceMocks.cacheServiceMock.get.mockImplementation((key: string) => {
        if (key.includes(':state')) return Promise.resolve(undefined); // CLOSED
        return Promise.resolve(undefined);
      });

      await service.recordFailure();

      expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledWith(expect.stringContaining(':state'), 'OPEN');
      expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledWith(
        expect.stringContaining(':opened_at'),
        expect.any(Number)
      );
    });

    it('should transition HALF_OPEN → OPEN on failure', async () => {
      // Arrange: HALF_OPEN state
      serviceMocks.cacheServiceMock.increment.mockResolvedValue(1);
      serviceMocks.cacheServiceMock.get.mockImplementation((key: string) => {
        if (key.includes(':state'))
          return Promise.resolve(CircuitBreakerStateEnum.HALF_OPEN as CircuitBreakerStateEnum);
        return Promise.resolve(undefined);
      });

      await service.recordFailure();

      expect(serviceMocks.cacheServiceMock.store).toHaveBeenCalledWith(
        expect.stringContaining(':state'),
        CircuitBreakerStateEnum.OPEN
      );
    });

    it('should not re-open when already OPEN', async () => {
      // Arrange: OPEN, but a new failure comes in
      mockParameterStore[NumericParameters.CircuitBreaker.Threshold] = '3';
      serviceMocks.cacheServiceMock.increment.mockResolvedValue(4); // above threshold
      serviceMocks.cacheServiceMock.get.mockImplementation((key: string) => {
        if (key.includes(':state')) return Promise.resolve(CircuitBreakerStateEnum.OPEN as CircuitBreakerStateEnum);
        return Promise.resolve(undefined);
      });

      await service.recordFailure();

      // store should NOT be called because we're already OPEN
      expect(serviceMocks.cacheServiceMock.store).not.toHaveBeenCalled();
    });
  });

  describe('use', () => {
    it('should return result and CLOSED state when circuit is closed and fn succeeds', async () => {
      // Arrange: CLOSED, no failures, fn resolves
      serviceMocks.cacheServiceMock.get.mockResolvedValue(undefined);
      serviceMocks.cacheServiceMock.increment.mockResolvedValue(0);

      const { result, error, circuitBreakerState } = await service.use(() => Promise.resolve('ok'));

      expect(result).toBe('ok');
      expect(error).toBeUndefined();
      expect(circuitBreakerState).toBe(CircuitBreakerStateEnum.CLOSED);
    });

    it('should return error without recording failure when circuit is already OPEN', async () => {
      // Arrange: OPEN circuit within halfOpenAfter window — checkCircuit throws CircuitBreakerOpenError
      vi.useFakeTimers();
      const now = 1000000;
      vi.setSystemTime(now * 1000);

      serviceMocks.cacheServiceMock.get.mockImplementation((key: string) => {
        if (key.includes(':state')) return Promise.resolve(CircuitBreakerStateEnum.OPEN as CircuitBreakerStateEnum);
        if (key.includes(':opened_at')) return Promise.resolve(now - 5); // within halfOpenAfter (30s)
        return Promise.resolve(undefined);
      });

      const { result, error, circuitBreakerState } = await service.use(async () => Promise.resolve('should not run'));

      expect(result).toBeUndefined();
      expect(error).toBeInstanceOf(CircuitBreakerOpenError);
      expect(circuitBreakerState).toBe(CircuitBreakerStateEnum.OPEN);
      // recordFailure should NOT have been called — the error was a CircuitBreakerOpenError
      expect(serviceMocks.cacheServiceMock.increment).not.toHaveBeenCalledWith(
        expect.stringContaining(':failures:'),
        expect.any(Number)
      );
    });
  });
});
