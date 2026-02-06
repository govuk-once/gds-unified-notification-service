/* eslint-disable @typescript-eslint/unbound-method */
import { CacheService } from '@common/services/cacheService';
import { MockConfigurationImplementation } from '@common/utils/mockConfigurationImplementation.test.unit.utils';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import redis from 'redis';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@ioc', { spy: true });

describe('CacheService', () => {
  let instance: CacheService;

  // Observability and Service mocks
  const observabilityMock = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMock);

  // Mocking implementation of the configuration service
  const mockConfigurationImplementation: MockConfigurationImplementation = new MockConfigurationImplementation();

  const createClientSpy = vi.spyOn(redis, 'createClient');
  const redisConnection = vi.fn();
  const setMock = vi.fn();
  const getMock = vi.fn();

  beforeEach(() => {
    // Reset all mock
    vi.resetAllMocks();
    mockConfigurationImplementation.resetConfig();

    serviceMocks.configurationServiceMock.getParameter = vi.fn().mockImplementation((namespace: string) => {
      return Promise.resolve(mockConfigurationImplementation.stringConfiguration[namespace]);
    });

    instance = new CacheService(serviceMocks.configurationServiceMock, observabilityMock);
    vi.spyOn(instance, 'generateSigV4').mockResolvedValue('');
    createClientSpy.mockImplementation(
      () =>
        ({
          connect: redisConnection,
          set: setMock,
          get: getMock,
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
