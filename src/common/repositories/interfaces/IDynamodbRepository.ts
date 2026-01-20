export interface IDynamodbRepository {
  createRecord<RecordType>(record: RecordType): Promise<void>;
  createRecordBatch<RecordType>(record: RecordType[]): Promise<void>;
  getRecord<RecordType>(key: string, value: string): Promise<RecordType | null>;
}
