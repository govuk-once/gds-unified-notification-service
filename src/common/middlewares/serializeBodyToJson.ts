import type { IRequestEvent, ITypedRequestResponse } from '@common/middlewares/interfaces';
import type { MiddlewareObj } from '@middy/core';

export const serializeBodyToJson = (): MiddlewareObj<IRequestEvent, ITypedRequestResponse<string>, Error> => ({
  after: async (request): Promise<void> => {
    if (
      request.response &&
      typeof request.response['body'] === 'object' &&
      !Array.isArray(request.response.body) &&
      request.response.body !== null
    ) {
      request.response.body = JSON.stringify(request.response.body, null, 2);
    }
  },
});
