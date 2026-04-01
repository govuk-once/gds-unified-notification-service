// Subset of parent enum - for processing stage
export enum NotificationProcessingStateEnum {
  VALIDATING = 'VALIDATING',
  VALIDATED = 'VALIDATED',
  VALIDATED_API_CALL = 'VALIDATED_API_CALL',
  VALIDATION_FAILED = 'VALIDATION_FAILED',

  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  PROCESSING_FAILED = 'PROCESSING_FAILED',

  DISPATCHING = 'DISPATCHING',
  DISPATCHED = 'DISPATCHED',
  DISPATCHING_FAILED = 'DISPATCHING_FAILED',
  UNKNOWN = 'UNKNOWN',
}
// Subset of parent enum - for post dispatched statuses
export enum NotificationDispatchedStateEnum {
  RECEIVED = 'RECEIVED',
  READ = 'READ',
  MARKED_AS_UNREAD = 'MARKED_AS_UNREAD',
  HIDDEN = 'HIDDEN',
}

// TS Enum merging is not great :/
export const NotificationStateEnum = {
  ...NotificationProcessingStateEnum,
  ...NotificationDispatchedStateEnum,
};

export type NotificationStateEnum = NotificationProcessingStateEnum | NotificationDispatchedStateEnum;
