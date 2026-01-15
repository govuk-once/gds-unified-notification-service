import { LambdaSourceEnum } from '@common/models/LambdaSourceEnum';
import { StatusEnum } from '@common/models/StatusEnum';

export interface MessageRecord {
  id: string;
  src: LambdaSourceEnum;
  status: StatusEnum;
  createdAt: string;
}
