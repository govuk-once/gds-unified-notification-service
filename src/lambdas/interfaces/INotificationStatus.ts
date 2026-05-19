import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import z from 'zod';

export const INotificationStatusSchema = z.array(
  z.object({
    NotificationID: z.string(),
    EventTimestamp: z.string(),
    Status: z.enum([
      NotificationStateEnum.UNKNOWN,
      NotificationStateEnum.RECEIVED,
      NotificationStateEnum.VALIDATING,
      NotificationStateEnum.VALIDATED,
      NotificationStateEnum.VALIDATED_API_CALL,
      NotificationStateEnum.VALIDATION_FAILED,
      NotificationStateEnum.PROCESSING,
      NotificationStateEnum.PROCESSED,
      NotificationStateEnum.PROCESSING_FAILED,
      NotificationStateEnum.DISPATCHING,
      NotificationStateEnum.DISPATCHED,
      NotificationStateEnum.DISPATCHING_FAILED,
      NotificationStateEnum.READ,
      NotificationStateEnum.MARKED_AS_UNREAD,
      NotificationStateEnum.HIDDEN,
    ]),
  })
);

export type INotificationStatus = z.infer<typeof INotificationStatusSchema>;
