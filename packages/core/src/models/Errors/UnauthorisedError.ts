import { BaseError } from '@common/models/Errors/BaseError';

export class UnauthorizedError extends BaseError {
  constructor(errors?: string[], message?: string) {
    super(errors ?? [], message);
    this.statusCode = 401;
    this.name = 'Unauthorized';
  }
}
