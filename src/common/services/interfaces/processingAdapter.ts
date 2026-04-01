import { ProcessingAdapterRequest } from '@common/services/interfaces/processingAdapterRequest';
import { ProcessingAdapterResult } from '@common/services/interfaces/processingAdapterResponse';

export interface ProcessingAdapter {
  initialize(): Promise<void>;
  send(payload: ProcessingAdapterRequest): Promise<ProcessingAdapterResult>;
}
