import { BaseError } from '@common/models/Errors/BaseError';

export class NotFoundError extends BaseError {
  constructor(errors?: string[], message?: string) {
    super(errors ?? [], message);
    this.statusCode = 404;
    this.name = 'NotFound';
  }
}

export class NoDispatchIdFound extends NotFoundError {}

export class NoLinkingIdFound extends NotFoundError {}
