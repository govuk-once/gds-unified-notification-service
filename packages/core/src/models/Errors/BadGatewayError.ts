import { BaseError } from '@common/models/Errors/BaseError';

export class BadGatewayError extends BaseError {
  constructor(errors?: string[], message?: string) {
    super(errors ?? [], message);
    this.statusCode = 502;
    this.name = 'BadGateway';
  }
}

export class DispatchAdapterError extends BadGatewayError {}

export class ProcessingAdapterError extends BadGatewayError {}
