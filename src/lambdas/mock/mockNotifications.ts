import { NotificationStateEnum } from '@common/models/NotificationStateEnum';
import { IFlexNotification } from '@project/lambdas/interfaces/IFlexNotification';

export const MOCK_NOTIFICATIONS: IFlexNotification[] = [
  {
    NotificationID: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    Status: NotificationStateEnum.READ,
    NotificationTitle: 'Your application has been received',
    NotificationBody: 'We have received your application and will be in touch shortly.',
    MessageTitle: 'Your application has been received',
    MessageBody: 'We have received your application and will be in touch shortly.',
    DispatchedAt: '2026-03-10T09:00:00.000Z',
  },
  {
    NotificationID: 'b2c3d4e5-f6a7-8901-bcde-f01234567891',
    Status: NotificationStateEnum.READ,
    NotificationTitle: 'Action required: verify your identity',
    NotificationBody: 'Please verify your identity to continue with your application.',
    MessageTitle: 'Action required: verify your identity',
    MessageBody: 'Please verify your identity to continue with your application.',
    DispatchedAt: '2026-03-11T14:30:00.000Z',
  },
  {
    NotificationID: 'c3d4e5f6-a7b8-9012-cdef-012345678912',
    Status: NotificationStateEnum.RECEIVED,
    NotificationTitle: 'Your documents have been approved',
    NotificationBody: 'All submitted documents have been reviewed and approved.',
    MessageTitle: 'Your documents have been approved',
    MessageBody: 'All submitted documents have been reviewed and approved.',
    DispatchedAt: '2026-03-12T11:15:00.000Z',
  },
  {
    NotificationID: 'd4e5f6a7-b8c9-0123-defa-123456789013',
    Status: NotificationStateEnum.RECEIVED,
    NotificationTitle: 'Your payment has been processed',
    NotificationBody: 'A payment of £142.00 has been processed for your account.',
    MessageTitle: 'Your payment has been processed',
    MessageBody: 'A payment of £142.00 has been processed for your account.',
    DispatchedAt: '2026-03-12T16:45:00.000Z',
  },
  {
    NotificationID: 'e5f6a7b8-c9d0-1234-efab-234567890124',
    Status: NotificationStateEnum.RECEIVED,
    NotificationTitle: 'Reminder: your appointment is tomorrow',
    NotificationBody: 'You have an appointment scheduled for 14 March 2026 at 10:30am.',
    MessageTitle: 'Reminder: your appointment is tomorrow',
    MessageBody: 'You have an appointment scheduled for 14 March 2026 at 10:30am.',
    DispatchedAt: '2026-03-13T08:00:00.000Z',
  },
  {
    NotificationID: 'f6a7b8c9-d0e1-2345-fabc-345678901235',
    Status: NotificationStateEnum.RECEIVED,
    NotificationTitle: 'New message from HMRC',
    NotificationBody: 'You have a new message regarding your tax return for 2024–25.',
    MessageTitle: 'New message from HMRC',
    MessageBody: 'You have a new message regarding your tax return for 2024–25.',
    DispatchedAt: '2026-03-13T10:20:00.000Z',
  },
  {
    NotificationID: 'a7b8c9d0-e1f2-3456-abcd-456789012346',
    Status: NotificationStateEnum.MARKED_AS_UNREAD,
    NotificationTitle: 'Your Universal Credit payment date has changed',
    NotificationBody: 'Your next payment will be made on 20 March 2026 instead of the usual date.',
    MessageTitle: 'Your Universal Credit payment date has changed',
    MessageBody: 'Your next payment will be made on 20 March 2026 instead of the usual date.',
    DispatchedAt: '2026-03-09T13:00:00.000Z',
  },
  {
    NotificationID: 'b8c9d0e1-f2a3-4567-bcde-567890123457',
    Status: NotificationStateEnum.READ,
    NotificationTitle: 'Your driving licence renewal is due',
    NotificationBody: 'Your driving licence expires on 1 June 2026. Renew now to avoid any disruption.',
    MessageTitle: 'Your driving licence renewal is due',
    MessageBody: 'Your driving licence expires on 1 June 2026. Renew now to avoid any disruption.',
    DispatchedAt: '2026-03-08T09:30:00.000Z',
  },
  {
    NotificationID: 'c9d0e1f2-a3b4-5678-cdef-678901234568',
    Status: NotificationStateEnum.PROCESSED,
    NotificationTitle: 'Action required: update your address',
    NotificationBody:
      'We have been unable to deliver correspondence to your registered address. Please update your details.',
    MessageTitle: 'Action required: update your address',
    MessageBody:
      'We have been unable to deliver correspondence to your registered address. Please update your details.',
    DispatchedAt: '2026-03-13T11:55:00.000Z',
  },
  {
    NotificationID: 'd0e1f2a3-b4c5-6789-defa-789012345679',
    Status: NotificationStateEnum.DISPATCHING,
    NotificationTitle: 'Your passport application is being processed',
    NotificationBody:
      'Your passport application reference RP123456 is currently being processed. You will be notified when a decision has been made.',
    MessageTitle: 'Your passport application is being processed',
    MessageBody:
      'Your passport application reference RP123456 is currently being processed. You will be notified when a decision has been made.',
    DispatchedAt: '2026-03-07T15:10:00.000Z',
  },
];

export const MOCK_NOTIFICATION_IDS = MOCK_NOTIFICATIONS.map((n) => n.NotificationID);
