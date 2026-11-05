import { ProcessingAdapterRequest } from '@common/services/interfaces/processingAdapterRequest';
import { ProcessingAdapterResult } from '@common/services/interfaces/processingAdapterResponse';

export interface ProcessingAdapter {
  send(payload: ProcessingAdapterRequest): Promise<ProcessingAdapterResult>;
}
