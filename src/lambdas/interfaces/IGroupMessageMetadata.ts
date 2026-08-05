import { IGroupMessage } from '@project/lambdas/interfaces/IMessage';

export interface IGroupMessageMetadata {
  GroupMessage: IGroupMessage;
  GroupNotificationID: string;
  WorkerID: number;
  CacheKey: string;
}
