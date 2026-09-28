import * as oneSignalMocks from './onesignal.mocks';
import * as udpMocks from './udp.mocks';
import * as genericMocks from './generic.mock';

export const handlers = [...oneSignalMocks.handlers, ...udpMocks.handlers, ...genericMocks.handlers];
