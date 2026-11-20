import { ServiceMisconfigurationError } from '@common/models/Errors/InternalServerError';
import { chunkArray } from '@common/utils/chunkArray';

describe('chunkArray', () => {
  it('should split an array into chunks of the given size', () => {
    // Act
    const result = chunkArray([1, 2, 3, 4, 5, 6], 2);

    // Assert
    expect(result).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it('should put the remainder in a smaller final chunk', () => {
    // Act
    const result = chunkArray([1, 2, 3, 4, 5, 6, 7], 3);

    // Assert
    expect(result).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });

  it('should return a single chunk when the array is smaller than the chunk size', () => {
    // Act
    const result = chunkArray([1, 2], 10);

    // Assert
    expect(result).toEqual([[1, 2]]);
  });

  it('should return no chunks for an empty array', () => {
    // Act
    const result = chunkArray([], 5);

    // Assert
    expect(result).toEqual([]);
  });

  it('should not mutate the original array', () => {
    // Arrange
    const array = [1, 2, 3];

    // Act
    chunkArray(array, 2);

    // Assert
    expect(array).toEqual([1, 2, 3]);
  });

  it.each([0, -1, 1.5, NaN])('should throw a ServiceMisconfigurationError when the chunk size is %s', (chunkSize) => {
    // Act & Assert
    expect(() => chunkArray([1, 2, 3], chunkSize)).toThrow(ServiceMisconfigurationError);
  });
});
