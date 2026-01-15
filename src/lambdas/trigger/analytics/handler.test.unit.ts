import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Configuration } from '@common/services';
import { Analytics } from '@project/lambdas/trigger/analytics/handler';

vi.mock('@common/ioc', () => ({
  iocGetConfigurationService: vi.fn(),
  iocGetQueueService: vi.fn(),
  iocGetLogger: vi.fn(),
  iocGetMetrics: vi.fn(),
  iocGetTracer: vi.fn(),
}));

describe('Management QueueHandler', () => {
  const getParameter = vi.fn();
  const info = vi.fn();

  const instance: Analytics = new Analytics(
    { getParameter } as unknown as Configuration,
    { info } as unknown as Logger,
    {} as unknown as Metrics,
    {} as unknown as Tracer
  );

  beforeEach(() => {});

  it('should have the correct operationId', () => {
    // Assert
    expect(instance.operationId).toBe('analytics');
  });
});
