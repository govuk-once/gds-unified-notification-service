import { ServiceMisconfigurationError } from '@common/models/Errors/InternalServerError';
import { splitArrayIntoChunks } from '@common/utils/splitArrayIntoChunks';

describe('splitArrayIntoChunks', () => {
  it('should split an array of 5 items into 5 chunks each with 1 item', () => {
    // Arrange
    const array = [1, 2, 3, 4, 5];
    const numberOfChunks = 5;

    // Act
    const result = splitArrayIntoChunks(array, numberOfChunks);

    // Assert
    expect(result).toEqual([[1], [2], [3], [4], [5]]);
  });

  it('should distribute remainders to the front chunks when array length is not evenly divisible', () => {
    // Arrange
    const array = [1, 2, 3, 4, 5, 6, 7];
    const numberOfChunks = 3;

    // Act
    const result = splitArrayIntoChunks(array, numberOfChunks);

    // Assert
    // 7 items into 3 chunks = sizes of 3, 2, 2
    expect(result).toEqual([
      [1, 2, 3],
      [4, 5],
      [6, 7],
    ]);
  });

  it('should split an array of 23 items into 5 chunks with sizes 5, 5, 5, 4, and 4', () => {
    // Arrange
    const array = Array.from({ length: 23 }, (_, i) => i + 1); // [1, 2, 3, ..., 23]
    const numberOfChunks = 5;

    // Act
    const result = splitArrayIntoChunks(array, numberOfChunks);

    // Assert
    expect(result).toEqual([
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [11, 12, 13, 14, 15],
      [16, 17, 18, 19],
      [20, 21, 22, 23],
    ]);
  });

  it('should split an array of 21 items into 5 chunks with sizes 5, 4, 4, 4, and 4', () => {
    // Arrange
    const array = Array.from({ length: 21 }, (_, i) => i + 1); // [1, 2, 3, ..., 23]
    const numberOfChunks = 5;

    // Act
    const result = splitArrayIntoChunks(array, numberOfChunks);

    // Assert
    expect(result).toEqual([
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9],
      [10, 11, 12, 13],
      [14, 15, 16, 17],
      [18, 19, 20, 21],
    ]);
  });

  it('should throw an error if numberOfChunks is 0 or negative', () => {
    // Arrange
    const array = [1, 2, 3];
    const exception = new ServiceMisconfigurationError([
      'The number of chunks to split array is not a positive integer.',
    ]);

    // Act
    const zeroResult = () => splitArrayIntoChunks(array, 0);

    // Assert
    expect(zeroResult).toThrow(exception);
  });

  it('should throw an error if numberOfChunks is negative', () => {
    // Arrange
    const array = [1, 2, 3];
    const exception = new ServiceMisconfigurationError([
      'The number of chunks to split array is not a positive integer.',
    ]);

    // Act
    const zeroResult = () => splitArrayIntoChunks(array, -1);

    // Assert
    expect(zeroResult).toThrow(exception);
  });

  it('should include empty sub-arrays if numberOfChunks is greater than the array length', () => {
    // Arrange
    const array = ['a', 'b'];
    const numberOfChunks = 4;

    // Act
    const result = splitArrayIntoChunks(array, numberOfChunks);

    // Assert
    expect(result).toEqual([['a'], ['b'], [], []]);
  });

  it('should return a single chunk containing all elements when numberOfChunks is 1', () => {
    // Arrange
    const array = [10, 20, 30];
    const numberOfChunks = 1;

    // Act
    const result = splitArrayIntoChunks(array, numberOfChunks);

    // Assert
    expect(result).toEqual([[10, 20, 30]]);
  });

  it('should work correctly with generic objects', () => {
    // Arrange
    const array = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const numberOfChunks = 2;

    // Act
    const result = splitArrayIntoChunks(array, numberOfChunks);

    // Assert
    expect(result).toEqual([[{ id: 1 }, { id: 2 }], [{ id: 3 }]]);
  });
});
