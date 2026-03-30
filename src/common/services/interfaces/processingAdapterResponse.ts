import { ProcessingAdapterRequest } from '@common/services/interfaces/processingAdapterRequest';

export interface ProcessingAdapterResult {
  request: ProcessingAdapterRequest;
  success: boolean;
  errors?: string[] | object;
  externalUserID?: string;
}
