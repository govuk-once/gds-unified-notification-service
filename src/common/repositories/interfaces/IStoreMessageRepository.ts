export interface IStoreMessageRepository {
  createRecord<RecordType>(record: RecordType): Promise<void>;
  getRecord<RecordType>(key: string, value: string): Promise<RecordType | null>;
}
