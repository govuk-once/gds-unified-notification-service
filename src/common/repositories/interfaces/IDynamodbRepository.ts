export interface IDynamodbRepository {
  createRecord<RecordType>(record: RecordType): Promise<void>;
  createRecordBatch<RecordType extends object>(record: RecordType[]): Promise<void>;
  updateRecord<RecordType extends object>(key: string, record: RecordType): Promise<void>;
  getRecord<RecordType>(key: string, value: string): Promise<RecordType | null>;
}
