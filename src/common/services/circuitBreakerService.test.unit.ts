import { CircuitBreakerStateEnum } from '@common/models';
import { CircuitBreakerOpenError, CircuitBreakerService } from '@common/services';
import { NumericParameters } from '@common/utils';
import { iocSpies, mockDefaultConfig, mockServicesExpectedBehaviour } from '@test/mocks';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });

describe('CircuitBreakerService', async () => {
  let service: CircuitBreakerService;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = await iocSpies();

  let mockParameterStore = mockDefaultConfig();

  beforeEach(() => {
    // Reset all mock
    vi.clearAllMocks();
    vi.useRealTimers();

    // Mock SSM store and services responses
    const { resetMockParameterStore } = mockServicesExpectedBehaviour(serviceMocks);
    mockParameterStore = resetMockParameterStore;

    service = new CircuitBreakerService(
      observabilityMocks,
      serviceMocks.configurationServiceMock,
      serviceMocks.cacheServiceMock,
      'test_platform'
    );
  });

  describe('getState', () => {
    it('should return CLOSED when no state is stored', async () => {
      // Arrange
      serviceMocks.cacheServiceMock.get.mockResolvedValue(undefined);

      // Act
      const state = await service.getState();

      // Assert
      expect(state).toBe('CLOSED');
    });

    it('should return the stored state', async () => {
      // Arrange
      serviceMocks.cacheServiceMock.get.mockResolvedValue(CircuitBreakerStateEnum.OPEN);

      // Act
      const state = await service.getState();

      // Assert
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

      // Act
      const circuit = service.checkCircuit();

      // Act & Assert — should not throw
      await expect(circuit).resolves.toBeUndefined();
    });

    it('should open the circuit and throw when failure count meets threshold', async () => {
      // Arrange: failure count at threshold
      serviceMocks.cacheServiceMock.get.mockImplementation((key: string) => {
        if (key.includes(':state')) return Promise.resolve(undefined); // CLOSED
        if (key.includes(':failures:')) return Promise.resolve(5); // equals threshold
        return Promise.resolve(undefined);
      });

      // Act
      const circuit = service.checkCircuit();

      // Assert
      await expect(circuit).rejects.toThrow(CircuitBreakerOpenError);
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

      // Act
      const circuit = service.checkCircuit();

      // Assert
      await expect(circuit).rejects.toThrow(CircuitBreakerOpenError);
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

      // Act
      const circuit = service.checkCircuit();

      // Assert
      await expect(circuit).resolves.toBeUndefined();
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

      // Act
      const circuit = service.checkCircuit();

      // Assert
      await expect(circuit).rejects.toThrow(CircuitBreakerOpenError);
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

      // Act
      const circuit = service.checkCircuit();

      // Assert
      await expect(circuit).resolves.toBeUndefined();
    });

    it('should throw when rate limit is exceeded in HALF_OPEN state', async () => {
      // Arrange: HALF_OPEN, rate limit exceeded
      serviceMocks.cacheServiceMock.get.mockImplementation((key: string) => {
        if (key.includes(':state'))
          return Promise.resolve(CircuitBreakerStateEnum.HALF_OPEN as CircuitBreakerStateEnum);
        return Promise.resolve(undefined);
      });
      serviceMocks.cacheServiceMock.increment.mockResolvedValue(6); // exceeds limit of 5

      // Act
      const circuit = service.checkCircuit();

      // Assert
      await expect(circuit).rejects.toThrow(CircuitBreakerOpenError);
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
      // Arrange: HALF_OPEN
      serviceMocks.cacheServiceMock.get.mockResolvedValue(CircuitBreakerStateEnum.HALF_OPEN);

      // Act
      await service.recordSuccess();

      // Assert
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

      // Act
      await service.recordFailure();

      // Assert
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

      // Act
      await service.recordFailure();

      // Assert
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

      // Act
      await service.recordFailure();

      // Assert
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

      // Act
      await service.recordFailure();

      // Assert
      // store should NOT be called because we're already OPEN
      expect(serviceMocks.cacheServiceMock.store).not.toHaveBeenCalled();
    });
  });

  describe('use', () => {
    it('should return result and CLOSED state when circuit is closed and fn succeeds', async () => {
      // Arrange: CLOSED, no failures, fn resolves
      serviceMocks.cacheServiceMock.get.mockResolvedValue(undefined);
      serviceMocks.cacheServiceMock.increment.mockResolvedValue(0);

      // Act
      const result = await service.use(() => Promise.resolve('ok'));

      // Assert
      expect(result).toBe('ok');
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

      // Act
      const result = service.use(async () => Promise.resolve('should not run'));

      // Assert
      await expect(result).rejects.toThrow(CircuitBreakerOpenError);
      expect(serviceMocks.cacheServiceMock.increment).not.toHaveBeenCalledWith(
        expect.stringContaining(':failures:'),
        expect.any(Number)
      );
    });
  });
});
