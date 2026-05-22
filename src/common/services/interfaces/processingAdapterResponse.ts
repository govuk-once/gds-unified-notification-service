import { ProcessingAdapterRequest } from '@common/services/interfaces/processingAdapterRequest';

export type ResultType<Success, Failure> = ({ success: true } & Success) | ({ success: false } & Failure);
export type WithResultType<Common, Success, Failure> = Common & ResultType<Success, Failure>;

export type ProcessingAdapterResult = WithResultType<
  { request: ProcessingAdapterRequest },
  { externalUserID: string },
  { errors: string[] | object }
>;
