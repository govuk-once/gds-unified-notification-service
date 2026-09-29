import { ParsingFailedError } from '@common/models';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DateInSeconds from './dateInSeconds';

describe('DateInSeconds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('now', () => {
    it('should return the current time in seconds', () => {
      // Arrange
      const expectedSeconds = Math.floor(new Date('2025-06-15T12:00:00Z').getTime() / 1000);

      // Act
      const result = DateInSeconds.now();

      // Assert
      expect(result).toBe(expectedSeconds);
    });

    it('should return a whole number', () => {
      // Arrange
      vi.setSystemTime(new Date('2025-06-15T12:00:00.500Z'));

      // Act
      const result = DateInSeconds.now();

      // Assert
      expect(Number.isInteger(result)).toBe(true);
    });
  });

  describe('toSeconds', () => {
    it('should convert a Date object to seconds', () => {
      // Arrange
      const date = new Date('2025-06-15T12:00:00Z');
      const expectedSeconds = Math.floor(date.getTime() / 1000);

      // Act
      const result = DateInSeconds.toSeconds(date);

      // Assert
      expect(result).toBe(expectedSeconds);
    });

    it('should convert a valid datetime string to seconds', () => {
      // Arrange
      const dateString = '2025-06-15T12:00:00Z';
      const expectedSeconds = Math.floor(new Date(dateString).getTime() / 1000);

      // Act
      const result = DateInSeconds.toSeconds(dateString);

      // Assert
      expect(result).toBe(expectedSeconds);
    });

    it('should floor milliseconds when converting a Date object', () => {
      // Arrange
      const date = new Date('2025-06-15T12:00:00.999Z');

      // Act
      const result = DateInSeconds.toSeconds(date);

      // Assert
      expect(Number.isInteger(result)).toBe(true);
      expect(result).toBe(Math.floor(date.getTime() / 1000));
    });

    it('should floor milliseconds when converting a datetime string', () => {
      // Arrange
      const dateString = '2025-06-15T12:00:00.999Z';

      // Act
      const result = DateInSeconds.toSeconds(dateString);

      // Assert
      expect(Number.isInteger(result)).toBe(true);
    });

    it('should produce the same result for a Date and its equivalent string', () => {
      // Arrange
      const dateString = '2025-06-15T12:00:00Z';
      const dateObject = new Date(dateString);

      // Act
      const fromString = DateInSeconds.toSeconds(dateString);
      const fromDate = DateInSeconds.toSeconds(dateObject);

      // Assert
      expect(fromString).toBe(fromDate);
    });

    it('should throw ParsingFailedError for an invalid datetime string', () => {
      // Arrange
      const invalidString = 'not-a-date';

      // Act & Assert
      expect(() => DateInSeconds.toSeconds(invalidString)).toThrow(ParsingFailedError);
    });

    it('should throw ParsingFailedError for an empty string', () => {
      // Act & Assert
      expect(() => DateInSeconds.toSeconds('')).toThrow(ParsingFailedError);
    });
  });
});
