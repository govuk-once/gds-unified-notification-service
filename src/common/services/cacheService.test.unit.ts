import { CacheService } from '@common/services/cacheService';
import { Configuration } from '@common/services/configuration';
import redis from 'redis';

describe('CacheService', () => {
  // Mocks preparation
  const getParameter = vi.fn();
  const createClientSpy = vi.spyOn(redis, 'createClient');
  const redisConnection = vi.fn();
  const setMock = vi.fn();
  const getMock = vi.fn();

  let instance: CacheService;
  beforeEach(() => {
    vi.resetAllMocks();
    instance = new CacheService({ getParameter } as unknown as Configuration);
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
      getParameter.mockResolvedValueOnce('name');
      getParameter.mockResolvedValueOnce('host');
      getParameter.mockResolvedValueOnce('user');

      // Act
      await instance.connect();

      // Assert
      expect(getParameter).toHaveBeenCalledTimes(3);
      expect(redisConnection).toHaveBeenCalled();
    });
  });

  it('should trigger SET command on redis connection using serialized value', async () => {
    // Arrange
    getParameter.mockResolvedValue('parameter');
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
    getParameter.mockResolvedValue('parameter');
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
    getParameter.mockResolvedValue('parameter');
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
