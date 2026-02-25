export interface IDynamodbRepository<RecordType> {
  createRecord(record: RecordType): Promise<void>;
  createRecordBatch(record: RecordType[]): Promise<void>;
  updateRecord<RecordType extends object>(recordFields: RecordType): Promise<void>;
  getRecord(key: string, value: string): Promise<RecordType | null>;
  getRecords(filter?: { field: string; value: string }): Promise<RecordType[]>;
}
