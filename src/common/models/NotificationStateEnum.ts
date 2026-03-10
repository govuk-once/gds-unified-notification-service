export enum NotificationStateEnum {
  UNKNOWN = 'UNKNOWN',

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

  RECEIVED = 'RECEIVED',
  READ = 'READ',
  MARKED_AS_UNREAD = 'MARKED_AS_UNREAD',
  HIDDEN = 'HIDDEN',
}
// Subset of parent enum - for processing stage
export enum NotificationProcessingStateEnum {
  VALIDATING = NotificationStateEnum.VALIDATING,
  VALIDATED = NotificationStateEnum.VALIDATED,
  VALIDATED_API_CALL = NotificationStateEnum.VALIDATED_API_CALL,
  VALIDATION_FAILED = NotificationStateEnum.VALIDATION_FAILED,
  PROCESSING = NotificationStateEnum.PROCESSING,
  PROCESSED = NotificationStateEnum.PROCESSED,
  PROCESSING_FAILED = NotificationStateEnum.PROCESSING_FAILED,
  DISPATCHING = NotificationStateEnum.DISPATCHING,
  DISPATCHED = NotificationStateEnum.DISPATCHED,
  DISPATCHING_FAILED = NotificationStateEnum.DISPATCHING_FAILED,
}
// Subset of parent enum - for post dispatched statuses
export enum NotificationDispatchedStateEnum {
  RECEIVED = NotificationStateEnum.RECEIVED,
  READ = NotificationStateEnum.READ,
  MARKED_AS_UNREAD = NotificationStateEnum.MARKED_AS_UNREAD,
  HIDDEN = NotificationStateEnum.HIDDEN,
}
