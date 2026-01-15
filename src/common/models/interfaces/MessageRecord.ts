import { LambdaSourceEnum } from '@common/models/LambdaSourceEnum';
import { StatusEnum } from '@common/models/StatusEnum';

export interface MessageRecord {
  guid: string;
  src: LambdaSourceEnum;
  status: StatusEnum;
  createdAt: string;
}
