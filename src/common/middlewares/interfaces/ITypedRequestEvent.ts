import type { IRequestEvent } from '@common/middlewares/interfaces/IRequestEvent';

export type ITypedRequestEvent<T, A = never> = Omit<IRequestEvent<A>, 'body'> & { body: T };
