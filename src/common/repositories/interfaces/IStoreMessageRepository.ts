import { MessageRecord } from '@common/models/interfaces/MessageRecord';

export interface IStoreMessageRepository {
  createRecord(record: MessageRecord): Promise<void>;
  getRecord(guid: string): Promise<MessageRecord | null>;
}
