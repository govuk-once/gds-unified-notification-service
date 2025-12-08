import type { IRequestEvent } from '@common/middlewares/interfaces/IRequestEvent';

export type ITypedRequestEvent<T> = Omit<IRequestEvent, 'body'> & { body: T };
