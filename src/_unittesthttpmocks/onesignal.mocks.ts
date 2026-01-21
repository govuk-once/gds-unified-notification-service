/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { http, HttpResponse } from 'msw';

export const handlers = [
  // Scenario responses can be adjusted for tests by changing API key
  http.post('https://api.onesignal.com/notifications', (request) => {
    const scenario = `${request.request.headers.get(`Authorization`)}`;
    switch (scenario) {
      case `Key ONESIGNAL_DEV_API_KEY_SUCCESS_SCENARIO_01`:
        return HttpResponse.json(
          {
            id: 'abc-123',
            firstName: 'John',
            lastName: 'Maverick',
          },
          { status: 200 }
        );
      case `Key ONESIGNAL_DEV_API_KEY_ERROR_SCENARIO_01`:
        return HttpResponse.json(
          {
            errors: [
              'Request is malformed: Failed to parse app_id from request',
              'Failed to parse app_id from request (app_id is present but malformed)',
            ],
          },
          { status: 400 }
        );
      default:
        throw new Error(`Unhandled scenario within unit tests`);
    }
  }),
];
