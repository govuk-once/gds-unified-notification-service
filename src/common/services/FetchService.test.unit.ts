import { FetchErrorResponse, FetchService, FetchTimeoutError } from '@common/services/FetchService';
import { error } from 'node:console';
import type { MockInstance } from 'vitest';

const createProps = (baseUrl: string = 'wwww.testing.co.uk') => ({
  baseUrl,
  defaultHeaders: {
    'x-api-key': 'fake-api-key',
    Authorization: 'Bearer fake-bearer',
  },
  defaultTimeout: 6000,
});
let instance: FetchService;
let fetchSpy: MockInstance;

describe('FetchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    instance = new FetchService(createProps());
    fetchSpy = vi.spyOn(instance, 'fetch');
  });
  it('should correctly merge base, instance, and request-specific headers', async () => {
    // Arrrange
    const successResponse = new Response(JSON.stringify({ data: 'success' }), { status: 200 });
    fetchSpy.mockResolvedValueOnce(successResponse);

    // Act
    await instance.get({
      path: '/health',
      headers: {
        test: 'testing header',
      },
    });

    // Assert
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/health'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          ...createProps().defaultHeaders,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          test: 'testing header',
        }),
      })
    );
  });

  it('should override custom x-api-key header passed by sending a header at the request level', async () => {
    // Arrrange
    const successResponse = new Response(JSON.stringify({ data: 'success' }), { status: 200 });
    fetchSpy.mockResolvedValueOnce(successResponse);

    // Act
    await instance.get({
      path: '/health',
      headers: {
        'x-api-key': 'new-api-key',
      },
    });

    // Assert
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/health'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-api-key': 'new-api-key',
        }),
      })
    );
  });

  it('should throw an invalid json error when it cannot parse the response', async () => {
    // Arrange
    const malformedJsonResponse = new Response('{"key": malformed_value}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    fetchSpy.mockResolvedValueOnce(malformedJsonResponse);

    // Act
    const result = instance.post({
      path: '/notifcation/',
    });

    // Assert
    await expect(result).rejects.toThrow(new Error('Received invalid JSON'));
  });

  it('should return a FetchErrorResponse when the response is not okay', async () => {
    // Arrange
    const failedResponse = new Response(JSON.stringify({ error: 'failed' }), { status: 400 });
    fetchSpy.mockResolvedValueOnce(failedResponse);

    // Act
    const result = instance.get({
      path: '/health',
      headers: {
        test: 'testing header',
      },
    });

    // Assert
    await expect(result).rejects.toThrow(
      new FetchErrorResponse({
        method: 'GET',
        status: 400,
        path: '/health',
        body: JSON.stringify({ error: 'failed' }),
      })
    );
  });

  it('should throw a FetchTimeoutError when error is a TimeoutError', async () => {
    // Arrrange
    const timeOutError = new Error('Time limit reached');
    timeOutError.name = 'TimeoutError';
    fetchSpy.mockRejectedValueOnce(timeOutError);

    // Act
    const result = instance.get({
      path: '/health',
      headers: {
        test: 'testing header',
      },
    });

    // Assert
    await expect(result).rejects.toThrow(FetchTimeoutError);
  });

  it('should return false when baseUrl does not contain .execute-api.', () => {
    // Arrange & Act
    const result = instance.isPrivateGateway();

    // Assert
    expect(result).toBeFalsy();
  });
  it('should return true when baseUrl does contain .execute-api.', () => {
    // Arrange
    instance = new FetchService(createProps('www.appid.execute-api.eu-west-2.amazonaws.com/api'));

    // Act
    const result = instance.isPrivateGateway();

    // Assert
    expect(result).toBeTruthy();
  });
});
