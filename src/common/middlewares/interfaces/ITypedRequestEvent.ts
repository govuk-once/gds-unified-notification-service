import type { IRequestEvent } from '@common/middlewares/interfaces/IRequestEvent';

export type ITypedRequestEvent<BodyT, PathT, QueryT> = Omit<
  IRequestEvent,
  'body' | 'queryStringParameters' | 'pathParameter'
> & { body: BodyT; queryStringParameters: QueryT; pathParameters: PathT };
