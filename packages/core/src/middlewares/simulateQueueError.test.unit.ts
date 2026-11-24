import { SimulatedError } from '@common/models/Errors/InternalServerError';
import { ObservabilityService } from '@common/services';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { simulateQueueError } from './simulateQueueError';

const observability = { logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } } as unknown as ObservabilityService;

const run = (body: unknown, operationId = 'dispatch') =>
  (simulateQueueError(observability, operationId).before as (request: unknown) => void)({
    event: { Records: [{ body }] },
  });

describe('simulateQueueError', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('when ENABLE_SIMULATED_ERRORS is true', () => {
    beforeEach(() => {
      vi.stubEnv('ENABLE_SIMULATED_ERRORS', 'true');
    });

    it('throws when the title targets this operation', () => {
      expect(() => run({ NotificationTitle: 'FAIL_AT_DISPATCH' })).toThrow(SimulatedError);
    });

    it('does not throw when the title targets another operation', () => {
      expect(() => run({ NotificationTitle: 'FAIL_AT_VALIDATION' })).not.toThrow();
    });

    it('does not throw for ordinary titles or unparsed string bodies', () => {
      expect(() => run({ NotificationTitle: 'Hello' })).not.toThrow();
      expect(() => run('not json')).not.toThrow();
    });
  });

  it.each([undefined, 'false'])('does not throw when ENABLE_SIMULATED_ERRORS is %s', (value) => {
    vi.stubEnv('ENABLE_SIMULATED_ERRORS', value);
    expect(() => run({ NotificationTitle: 'FAIL_AT_DISPATCH' })).not.toThrow();
  });
});
