import * as oneSignalMocks from './onesignal.mocks';
import * as udpMocks from './udp.mocks';

export const handlers = [...oneSignalMocks.handlers, ...udpMocks.handlers];
