import { BaseError } from '@common/models/Errors/BaseError';

export class InternalServerError extends BaseError {
  constructor(errors?: string[], message?: string) {
    super(errors ?? [], message);
    this.statusCode = 500;
    this.name = 'InternalServerError';
  }
}

export class ServiceMisconfigurationError extends InternalServerError {}

export class SimulatedError extends InternalServerError {}
