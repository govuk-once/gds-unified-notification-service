export interface MockMessageResponse {
  userId: number;
  context: string;
  status: 'SENT' | 'OPENED' | 'READ' | 'EXPIRED' | 'FAILED';
}

export class MockMessageService {
  public processMessage(): MockMessageResponse {
    return {
      userId: 11,
      context: 'Hello UK!',
      status: 'SENT',
    };
  }
}
