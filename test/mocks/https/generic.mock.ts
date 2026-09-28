import { http, HttpResponse } from 'msw';

export const handlers = [
  // Scenario responses can be adjusted for tests by changing headers & request method
  http.get('https://www.testing.com/health', (request) => {
    const headers = request.request.headers;
    if (headers.has('test') && headers.get('test') == 'testing header') {
      return HttpResponse.json(
        {
          message: 'Testing header was found',
        },
        { status: 200 }
      );
    }
    throw new Error(`Unhandled scenario within unit tests`);
  }),
  http.post('https://www.testing.com/user', (request) => {
    const scenario = request.request.headers.get('x-test-scenario');
    switch (scenario) {
      case `KEY DEFAULT_HEADERS`:
        return HttpResponse.json(
          {
            message: 'used default headers at class level',
          },
          { status: 200 }
        );
      case `KEY OVERRIDE_DEFAULT_HEADERS`:
        return HttpResponse.json(
          {
            message: 'override the default headers at class level',
          },
          { status: 200 }
        );
      default:
        throw new Error(`Unhandled scenario within unit tests`);
    }
  }),
  http.delete('https://www.testing.com/failed', (request) => {
    const scenario = request.request.headers.get('Authorization');
    console.log(scenario);
    switch (scenario) {
      case `Key MALFORMED_JSON`:
        const malformedJson = '{ "status": "ok", broken: true }';
        return HttpResponse.text(malformedJson, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      case `Key FAILED_RESPONSE`:
        return HttpResponse.json({ error: 'failed response' }, { status: 400 });
      default:
        throw new Error(`Unhandled scenario within unit tests`);
    }
  }),
];
