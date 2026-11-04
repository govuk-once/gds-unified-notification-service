import { ProcessingAdapterRequest } from '@common/services/interfaces/processingAdapterRequest';

export type ProcessingAdapterResult = {
  request: ProcessingAdapterRequest;
  externalUserID: string;
};
