import { describe, expect, it } from 'vitest';
import { MockMessageService } from './app';

describe('MockMessageService', () => {
  let mockMessageService: MockMessageService;

  beforeEach(() => {
    mockMessageService = new MockMessageService();
  });

  describe('testing vitest', () => {
    it('hello UK!', () => {
      const result = mockMessageService.processMessage();

      expect(result.context).toBe('Hello UK!');
      expect(result.status).toBe('SENT');
    });
  });
});
