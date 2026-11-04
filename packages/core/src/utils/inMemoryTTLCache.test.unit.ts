import { InMemoryTTLCache } from '@common/utils/inMemoryTTLCache';

describe('InMemoryTTLCache', () => {
  let instance: InMemoryTTLCache<string, string>;

  const ttl = 1000;

  beforeEach(() => {
    // Resets all mocks
    vi.clearAllMocks();
    vi.useRealTimers();

    instance = new InMemoryTTLCache<string, string>(ttl);
  });

  describe('set', () => {
    it('should set a key value pair in the cache.', () => {
      // Act
      instance.set('testKey', 'testValue');

      // Assert
      expect(instance.data.get('testKey')).toEqual('testValue');
    });

    it('should delete a value after the TTL expires.', () => {
      // Arrange
      vi.useFakeTimers();

      // Act
      instance.set('testKey', 'testValue');

      // Assert
      expect(instance.data.has('testKey')).toEqual(true);
      vi.advanceTimersByTime(ttl + 1);
      expect(instance.data.has('testKey')).toEqual(false);
    });

    it('should refresh the timer when the key is set.', () => {
      // Arrange
      vi.useFakeTimers();
      instance.set('testKey', 'testValue');
      vi.advanceTimersByTime(500);

      // Act
      instance.set('testKey', 'testValue-updated');

      // Assert
      // asserts the testKey lives past the original TTL
      vi.advanceTimersByTime(501);
      expect(instance.data.has('testKey')).toEqual(true);
      // asserts the testKey has been removed after the refreshed TTL
      vi.advanceTimersByTime(500);
      expect(instance.data.has('testKey')).toEqual(false);
    });
  });

  describe('get', () => {
    it('get the correct value based off a key.', () => {
      // Arrange
      instance.data.set('testKey', 'testValue');

      // Act
      const result = instance.get('testKey');

      // Assert
      expect(result).toEqual('testValue');
    });
  });

  describe('has', () => {
    it('returns a boolean of whether the data has a value based of a key - true.', () => {
      // Arrange
      instance.data.set('testKey', 'testValue');

      // Act
      const result = instance.has('testKey');

      // Assert
      expect(result).toEqual(true);
    });

    it('returns a boolean of whether the data has a value based of a key - false.', () => {
      // Act
      const result = instance.has('testKey');

      // Assert
      expect(result).toEqual(false);
    });
  });

  describe('delete', () => {
    it('deletes a key value pair from the cache when given a key', () => {
      // Arrange
      instance.data.set('testKey', 'testValue');

      // Act
      instance.delete('testKey');

      // Assert
      expect(instance.data.has('testKey')).toEqual(false);
    });
  });

  describe('clear', () => {
    it('removes all key value pairs from the cache.', () => {
      // Arrange
      instance.data.set('testKey', 'testValue');
      instance.data.set('testKey2', 'testValue2');

      // Act
      instance.clear();

      // Assert
      expect(instance.data.size).toEqual(0);
    });
  });
});
