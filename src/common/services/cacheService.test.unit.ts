/* eslint-disable @typescript-eslint/unbound-method */
import { CacheService } from '@common/services/cacheService';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import redis from 'redis';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@ioc', { spy: true });

describe('CacheService', () => {
  // Mocks preparation
  const observabilityMock = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMock);
  serviceMocks.configurationServiceMock.getParameter = vi.fn();

  const createClientSpy = vi.spyOn(redis, 'createClient');
  const redisConnection = vi.fn();
  const setMock = vi.fn();
  const getMock = vi.fn();

  let instance: CacheService;
  beforeEach(() => {
    vi.resetAllMocks();
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
      // Arrange
      serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce('name');
      serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce('host');
      serviceMocks.configurationServiceMock.getParameter.mockResolvedValueOnce('user');

      // Act
      await instance.connect();

      // Assert
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledTimes(3);
      expect(redisConnection).toHaveBeenCalled();
    });
  });

  it('should trigger SET command on redis connection using serialized value', async () => {
    // Arrange
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue('parameter');
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
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue('parameter');
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
    serviceMocks.configurationServiceMock.getParameter.mockResolvedValue('parameter');
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
