import type { Logger } from '@aws-lambda-powertools/logger';
import type { MiddlewareObj } from '@middy/core';

export const appendFunctionVersion = (logger: Logger): MiddlewareObj => ({
  before: (request): void => {
    logger.appendKeys({ functionVersion: request.context.functionVersion });
    if (process.env.RELEASE_VERSION) {
      logger.appendKeys({ releaseVersion: process.env.RELEASE_VERSION });
    }
  },
});
