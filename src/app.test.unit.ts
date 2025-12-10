import { describe, it, expect } from 'vitest';
import { MockMessageService } from './app.ts';

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
