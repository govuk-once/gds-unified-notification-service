import { http, HttpResponse } from 'msw';

export const handlers = [
  // Scenario responses can be adjusted for tests by changing API key
  http.get('https://udp/v1/notifications', (request) => {
    const scenario = `${request.request.headers.get(`requesting-service-user-id`)}`;
    switch (scenario) {
      case `bob`:
        return HttpResponse.json(
          {
            data: {
              consentStatus: 'accepted',
              pushId: 'bob:app:push:id',
            },
          },
          { status: 200 }
        );
      default:
        throw new Error(`Unhandled scenario within unit tests`);
    }
  }),
];
