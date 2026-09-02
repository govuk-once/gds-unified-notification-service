import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { CacheService } from '@common/services/cacheService';
import { MetricsLabels } from '@common/services/observabilityService';
import { iocSpies, mockServicesExpectedBehaviour } from '@test/mocks';
import redis from 'redis';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });

describe('CacheService', () => {
  let instance: CacheService;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = iocSpies();

  const createClientSpy = vi.spyOn(redis, 'createClient');
  const redisConnection = vi.fn();
  const setMock = vi.fn();
  const getMock = vi.fn();
  const incrByMock = vi.fn();
  const expireMock = vi.fn();

  beforeEach(() => {
    // Reset all mock
    vi.resetAllMocks();

    // Mock SSM store and services responses
    mockServicesExpectedBehaviour(serviceMocks);

    instance = new CacheService(serviceMocks.configurationServiceMock, observabilityMocks);
    vi.spyOn(instance, 'generateSigV4').mockResolvedValue('');
    createClientSpy.mockImplementation(
      () =>
        ({
          connect: redisConnection,
          set: setMock,
          get: getMock,
          expire: expireMock,
          incrBy: incrByMock,
        }) as unknown as ReturnType<typeof redis.createClient>
    );
  });

  describe('connect', () => {
    it('should fetch data from configuration service when connecting', async () => {
      // Act
      await instance.connect();

      // Assert
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledTimes(3);
      expect(redisConnection).toHaveBeenCalled();
    });
  });
  describe('store', () => {
    it('should trigger SET command on redis connection using serialized value', async () => {
      // Arrange
      const key = 'a';
      const value = 'example';

      // Act
      await instance.connect();
      await instance.store(key, value);

      // Assert
      expect(setMock).toHaveBeenCalledTimes(1);
      expect(setMock).toHaveBeenCalledWith(key, JSON.stringify(value));
    });
  });

  describe('get', () => {
    it('should trigger GET command on redis, and return undefined if no value exists', async () => {
      // Arrange
      getMock.mockResolvedValueOnce(undefined);
      const key = 'a';

      // Act
      await instance.connect();
      await instance.get(key);

      // Assert
      expect(getMock).toHaveBeenCalledTimes(1);
      expect(getMock).toHaveBeenCalledWith(key);
    });

    it('should trigger GET command on redis, and use provided factory to set default value', async () => {
      // Arrange
      const factory = vi.fn().mockResolvedValueOnce(7);
      getMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce(7);
      const key = 'a';

      // Act
      await instance.connect();
      await instance.get(key, { factory: factory });

      // Assert
      expect(getMock).toHaveBeenCalledTimes(2);
      expect(getMock).toHaveBeenCalledWith(key);
      expect(setMock).toHaveBeenCalledTimes(1);
      expect(setMock).toHaveBeenCalledWith(key, JSON.stringify(7));
      expect(factory).toHaveBeenCalledTimes(1);
    });
  });

  describe('increment', () => {
    it('should increment the key by 1 and set the correct TTL', async () => {
      // Arrange
      incrByMock.mockResolvedValueOnce(12);
      const key = 'key';
      const ttl = 120;

      // Act
      await instance.connect();
      const result = await instance.increment(key, ttl);

      // Assert
      expect(result).toEqual(12);
      expect(incrByMock).toHaveBeenCalledExactlyOnceWith(key, 1);
      expect(expireMock).toHaveBeenCalledExactlyOnceWith(key, ttl);
    });
  });

  describe('rateLimit', () => {
    const KEY = 'RATE_LIMIT_KEY';
    const maxPerMinute = 5;
    const expectedKey = 'RATE_LIMIT_KEY:1787789220';

    vi.useFakeTimers();
    const currentTime = new Date('2026-08-27T00:07:00.000Z');
    vi.setSystemTime(currentTime);

    it('should create the key at 0 when increment is not provided and the key does not exist, and returns the correct state', async () => {
      // Arrange
      getMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce('0');
      // Act
      await instance.connect();
      const result = await instance.rateLimit(KEY, maxPerMinute);

      // Assert
      expect(getMock).toHaveBeenCalledTimes(2);
      expect(getMock).toHaveBeenNthCalledWith(1, expectedKey);
      expect(getMock).toHaveBeenNthCalledWith(2, expectedKey);
      expect(incrByMock).toHaveBeenCalledTimes(0);
      expect(result).toEqual({
        capacityRemaining: maxPerMinute,
        exceeded: false,
      });
    });

    it('should not create the key when increment is not provided and the key already exists, and return the correct state', async () => {
      // Arrange
      const counter = 3;
      getMock.mockResolvedValueOnce(counter);

      // Act
      await instance.connect();
      const result = await instance.rateLimit(KEY, maxPerMinute);

      // Assert
      expect(getMock).toHaveBeenCalledExactlyOnceWith(expectedKey);
      expect(setMock).toHaveBeenCalledTimes(0);
      expect(incrByMock).toHaveBeenCalledTimes(0);
      expect(expireMock).toHaveBeenCalledTimes(0);
      expect(result).toEqual({
        capacityRemaining: maxPerMinute - counter,
        exceeded: false,
      });
    });

    it('should increment the key and set an expiry on the cache when increment is proivded, and return the correct state', async () => {
      // Arrange
      const counter = 3;
      const increment = 1;
      incrByMock.mockResolvedValueOnce(counter + increment);

      // Assert
      await instance.connect();
      const result = await instance.rateLimit(KEY, maxPerMinute, increment);

      // Assert
      expect(incrByMock).toHaveBeenCalledExactlyOnceWith(expectedKey, 1);
      expect(expireMock).toHaveBeenCalledExactlyOnceWith(expectedKey, 60);
      expect(result).toEqual({ exceeded: false, capacityRemaining: maxPerMinute - counter - increment });
      expect(getMock).toHaveBeenCalledTimes(0);
    });

    it('should log and add metrics when incrementation does not exceed limit', async () => {
      // Arrange
      const counter = 3;
      const increment = 1;
      incrByMock.mockResolvedValueOnce(counter + increment);

      // Assert
      await instance.connect();
      await instance.rateLimit(KEY, maxPerMinute, increment);

      // Assert
      expect(observabilityMocks.logger.info).toHaveBeenCalledExactlyOnceWith('Rate limiting status', {
        counter: 4,
        key: KEY,
        maxPerMinute: maxPerMinute,
        percent: 0.8,
      });
      expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledTimes(3);
      expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
        MetricsLabels.CURRENT_RATE,
        MetricUnit.Count,
        4
      );
      expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
        MetricsLabels.CURRENT_RATE_LIMIT,
        MetricUnit.Count,
        maxPerMinute
      );
      expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
        MetricsLabels.RATE_LIMITING_ENFORCED,
        MetricUnit.NoUnit,
        0
      );
    });

    it('should report exceeded and the correct capacityRemaining once the counter reaches the limit', async () => {
      // Arrange
      const counter = 5;
      const increment = 1;
      incrByMock.mockResolvedValueOnce(counter + increment);

      // Assert
      await instance.connect();
      const result = await instance.rateLimit(KEY, maxPerMinute, increment);

      // Assert
      expect(incrByMock).toHaveBeenCalledExactlyOnceWith(expectedKey, 1);
      expect(expireMock).toHaveBeenCalledExactlyOnceWith(expectedKey, 60);
      expect(result).toEqual({ exceeded: true, capacityRemaining: 0 });
      expect(getMock).toHaveBeenCalledTimes(0);
    });

    it('should log and add metrics when incrementation does exceed limit', async () => {
      // Arrange
      const counter = 5;
      const increment = 1;
      incrByMock.mockResolvedValueOnce(counter + increment);

      // Assert
      await instance.connect();
      await instance.rateLimit(KEY, maxPerMinute, increment);

      // Assert
      expect(observabilityMocks.logger.info).toHaveBeenCalledExactlyOnceWith('Rate limiting status', {
        counter: 6,
        key: KEY,
        maxPerMinute: maxPerMinute,
        percent: 1.2,
      });
      expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledTimes(3);
      expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
        MetricsLabels.CURRENT_RATE,
        MetricUnit.Count,
        6
      );
      expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
        MetricsLabels.CURRENT_RATE_LIMIT,
        MetricUnit.Count,
        maxPerMinute
      );
      expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
        MetricsLabels.RATE_LIMITING_ENFORCED,
        MetricUnit.NoUnit,
        1
      );
    });
  });
});
