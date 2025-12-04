import type { IRequestResponse } from '@common/middlewares/interfaces/IRequestResponse';

export type ITypedRequestResponse<T> = Omit<IRequestResponse, 'body'> & {
  body: T;
};
