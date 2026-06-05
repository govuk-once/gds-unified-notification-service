import { BaseError } from '@common/models/Errors/BaseError';

export class ExpectationFailedError extends BaseError {
  constructor(errors?: string[], message?: string) {
    super(errors ?? [], message);
    this.statusCode = 417;
    this.name = 'ExpectationFailedError';
  }
}
