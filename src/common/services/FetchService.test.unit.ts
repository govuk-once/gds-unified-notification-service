import { FetchService } from '@common/services/FetchService';

const createProps = (baseUrl: string = 'https://www.testing.com') => ({
  baseUrl,
  defaultHeaders: {
    'x-api-key': 'fake-api-key',
    'x-test-scenario': 'KEY DEFAULT_HEADERS',
  },
  defaultTimeout: 1000,
});
let instance: FetchService;

describe('FetchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    instance = new FetchService(createProps());
  });
  it('should correctly add new headers to the request', async () => {
    // Arrange & Act
    const result = await instance.get({
      path: '/health',
      headers: {
        test: 'testing header',
      },
    });

    // Assert
    expect(result).toEqual(
      expect.objectContaining({
        status: 200,
        body: { message: 'Testing header was found' },
      })
    );
  });

  it('should add headers from the class level using default headers', async () => {
    // Arrange & Act
    const result = await instance.post({
      path: '/user',
    });

    // Assert
    expect(result).toEqual(
      expect.objectContaining({
        status: 200,
        body: { message: 'used default headers at class level' },
      })
    );
  });

  it('should override x-test-scenario header by sending a header at the request level', async () => {
    // Arrange & Act
    const result = await instance.post({
      path: '/user',
      headers: {
        'x-test-scenario': 'KEY OVERRIDE_DEFAULT_HEADERS',
      },
    });

    // Assert
    expect(result).toEqual(
      expect.objectContaining({
        status: 200,
        body: { message: 'override the default headers at class level' },
      })
    );
  });

  it('should throw an invalid json error when it cannot parse the response', async () => {
    // Arrange & Act
    const result = instance.delete({
      path: '/failed',
      headers: { Authorization: 'Key MALFORMED_JSON' },
    });

    // Assert
    await expect(result).rejects.toThrow(new Error('Received invalid JSON'));
  });

  it('should return a FetchErrorResponse when the response is not okay', async () => {
    // Arrange & Act
    const result = instance.delete({
      path: '/failed',
      headers: { Authorization: 'Key FAILED_RESPONSE' },
    });

    // Assert
    await expect(result).rejects.toThrow(
      expect.objectContaining({
        method: 'DELETE',
        status: 400,
        message: 'API [DELETE] /failed Failed with 400',
      })
    );
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
