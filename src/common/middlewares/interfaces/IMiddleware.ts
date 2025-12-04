import type { IRequestEvent } from '@common/middlewares/interfaces/IRequestEvent';
import type { IRequestResponse } from '@common/middlewares/interfaces/IRequestResponse';
import type { MiddyfiedHandler } from '@middy/core';
import type { Context } from 'aws-lambda';

export type IMiddleware = MiddyfiedHandler<
  IRequestEvent,
  IRequestResponse,
  Error,
  Context,
  {}
>;
