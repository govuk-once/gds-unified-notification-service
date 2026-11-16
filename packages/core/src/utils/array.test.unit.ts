import { partition } from '@common/utils/array';

describe('partition', () => {
  it('should split items into those matching the predicate and the rest', () => {
    // Arrange
    const items = [1, 2, 3, 4, 5];

    // Act
    const [even, odd] = partition(items, (n) => n % 2 === 0);

    // Assert
    expect(even).toEqual([2, 4]);
    expect(odd).toEqual([1, 3, 5]);
  });

  it('should preserve the original order in both arrays', () => {
    // Arrange
    const items = ['b', 'a2', 'c', 'a1'];

    // Act
    const [startsWithA, rest] = partition(items, (s) => s.startsWith('a'));

    // Assert
    expect(startsWithA).toEqual(['a2', 'a1']);
    expect(rest).toEqual(['b', 'c']);
  });

  it('should return two empty arrays for an empty input', () => {
    // Act
    const result = partition([], () => true);

    // Assert
    expect(result).toEqual([[], []]);
  });

  it('should put every item in the first array when all items match', () => {
    // Act
    const result = partition([1, 2, 3], () => true);

    // Assert
    expect(result).toEqual([[1, 2, 3], []]);
  });

  it('should put every item in the second array when no items match', () => {
    // Act
    const result = partition([1, 2, 3], () => false);

    // Assert
    expect(result).toEqual([[], [1, 2, 3]]);
  });

  it('should not mutate the input array', () => {
    // Arrange
    const items = [1, 2, 3];

    // Act
    partition(items, (n) => n > 1);

    // Assert
    expect(items).toEqual([1, 2, 3]);
  });
});
