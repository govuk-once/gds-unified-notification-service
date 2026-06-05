import { BaseError } from '@common/models/Errors/BaseError';

export class TooManyRequestsError extends BaseError {
  constructor(errors?: string[], message?: string) {
    super(errors ?? [], message);
    this.statusCode = 429;
    this.name = 'TooManyRequestsError';
  }
}

export class RateLimitingError extends TooManyRequestsError {}
