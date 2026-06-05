import { BaseError } from '@common/models/Errors/BaseError';

export class BadRequestError extends BaseError {
  constructor(errors?: string[], message?: string) {
    super(errors ?? [], message);
    this.statusCode = 400;
    this.name = 'BadRequestError';
  }
}

export class ContentValidationError extends BadRequestError {}

export class UnidentifiableRecordError extends BadRequestError {}

export class SerializationError extends BadRequestError {}
