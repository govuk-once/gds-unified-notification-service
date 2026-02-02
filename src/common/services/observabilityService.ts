import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';

export class ObservabilityService {
  constructor(
    public logger: Logger,
    public metrics: Metrics,
    public tracer: Tracer
  ) {}
}
