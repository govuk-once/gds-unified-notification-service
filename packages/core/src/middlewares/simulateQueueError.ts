import { SimulatedError } from '@common/models/Errors/InternalServerError';
import type { ObservabilityService } from '@common/services';
import type { MiddlewareObj } from '@middy/core';
import type { SQSEvent } from 'aws-lambda';

// Maps the NotificationTitle supplied by e2e tests to the operation that should fail
const titleToOperationMap: Record<string, string> = {
  FAIL_AT_VALIDATION: 'validation',
  FAIL_AT_PROCESSING: 'processing',
  FAIL_AT_DISPATCH: 'dispatch',
  FAIL_AT_ANALYTICS: 'analytics',
};

/**
 * Throws a SimulatedError when a record's NotificationTitle targets this operation.
 * Only active where ENABLE_SIMULATED_ERRORS is 'true' (e2e environments, never prod).
 * Must run after the record body has been deserialized.
 */
export const simulateQueueError = (
  observability: ObservabilityService,
  operationId: string
): MiddlewareObj<SQSEvent> => ({
  before: (request): void => {
    if (process.env.ENABLE_SIMULATED_ERRORS !== 'true') {
      return;
    }

    for (const record of request.event.Records) {
      const body = record.body as unknown as Record<string, string> | undefined;
      const notificationTitle = body?.NotificationTitle;

      if (notificationTitle && titleToOperationMap[notificationTitle] === operationId) {
        observability.logger.warn('Simulating an error for operation', { OperationId: operationId });
        throw new SimulatedError([`Simulating an error!`]);
      }
    }
  },
});
