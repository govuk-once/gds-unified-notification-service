/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@aws-lambda-powertools/logger';
import { toIMessageRecord } from '@common/builders/toIMessageRecord';
import { IMessage } from '@project/lambdas/interfaces/IMessage';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';

vi.mock('@aws-lambda-powertools/logger', { spy: true });

describe('toIMessageRecord', () => {
  const loggerMock = vi.mocked(new Logger());

  it('should map an IMessage to an IMessage Record.', () => {
    // Arrange
    const message: IMessage = {
      NotificationID: '1234',
      DepartmentID: 'DVLA01',
      UserID: 'UserID',
      MessageTitle: 'You have a new Message',
      MessageBody: 'Open Notification Centre to read your notifications',
      NotificationTitle: 'You have a new medical driving license',
      NotificationBody: 'The DVLA has issued you a new license.',
    };

    // Act
    const result = toIMessageRecord({ recordFields: message }, loggerMock);

    // Assert
    expect(result).toEqual({
      NotificationID: '1234',
      DepartmentID: 'DVLA01',
      UserID: 'UserID',
      MessageTitle: 'You have a new Message',
      MessageBody: 'Open Notification Centre to read your notifications',
      NotificationTitle: 'You have a new medical driving license',
      NotificationBody: 'The DVLA has issued you a new license.',
    } as IMessageRecord);
  });

  it('should map an IMessage and a receivedDateTime to an IMessage Record.', () => {
    // Arrange
    const message: IMessage = {
      NotificationID: '1234',
      DepartmentID: 'DVLA01',
      UserID: 'UserID',
      MessageTitle: 'You have a new Message',
      MessageBody: 'Open Notification Centre to read your notifications',
      NotificationTitle: 'You have a new medical driving license',
      NotificationBody: 'The DVLA has issued you a new license.',
    };

    // Act
    const result = toIMessageRecord({ recordFields: message, receivedDateTime: '202601021513' }, loggerMock);

    // Assert
    expect(result).toEqual({
      NotificationID: '1234',
      DepartmentID: 'DVLA01',
      UserID: 'UserID',
      MessageTitle: 'You have a new Message',
      MessageBody: 'Open Notification Centre to read your notifications',
      NotificationTitle: 'You have a new medical driving license',
      NotificationBody: 'The DVLA has issued you a new license.',
      ReceivedDateTime: '202601021513',
    } as IMessageRecord);
  });

  it('should log an error when IMessage does not have a NotificationID.', () => {
    // Arrange
    const message: Partial<IMessage> = {
      DepartmentID: 'DVLA01',
      UserID: 'UserID',
    };

    // Act
    toIMessageRecord({ recordFields: message }, loggerMock);

    // Assert
    expect(loggerMock.error).toBeCalledWith('Failed to build MessageRecord, no NotificationID was provided.');
  });
});
