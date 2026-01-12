import { StatusEnum } from '@common/models/StatusEnum';

export interface MessageRecord {
  guid: string;
  status: StatusEnum;
  createdAt: string;
}
