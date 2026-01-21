import { IMessage } from '@project/lambdas/interfaces/IMessage';

export interface IProcessedMessage extends IMessage {
  OneSignalID: string;
}
