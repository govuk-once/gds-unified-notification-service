import { search } from '@aws-lambda-powertools/jmespath';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import 'reflect-metadata';
import { container } from 'tsyringe';

// Services

// Observability singletons
container.register<Logger>('Logger', {
  useValue: new Logger({
    serviceName: process.env.SERVICE_NAME ?? 'undefined',
    correlationIdSearchFn: search,
  }),
});
container.register<Tracer>('Tracer', { useValue: new Tracer() });
container.register<Metrics>('Metrics', {
  useValue: new Metrics({
    namespace: process.env.NAMESPACE_NAME ?? 'undefined',
    serviceName: process.env.SERVICE_NAME ?? 'undefined',
    defaultDimensions: { environment: process.env.ENVIRONMENT ?? 'undefined' },
  }),
});

// Export container
export const ioc = container;
