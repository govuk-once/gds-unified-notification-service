import type { Logger } from '@aws-lambda-powertools/logger';
import { appendFunctionVersion } from '@common/middlewares/appendFunctionVersion';
import middy from '@middy/core';
import type { Context } from 'aws-lambda';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('appendFunctionVersion', () => {
  const mockContext = { functionVersion: '5' } as unknown as Context;

  afterEach(() => {
    delete process.env.RELEASE_VERSION;
  });

  it('should append functionVersion from Lambda context to logger', async () => {
    // Arrange - define mock lambda
    const mockLogger = { appendKeys: vi.fn() } as unknown as Logger;
    const fn = middy().use(appendFunctionVersion(mockLogger)).handler(vi.fn());

    // Act
    await fn({}, mockContext);

    // Expect
    expect(mockLogger.appendKeys).toHaveBeenCalledWith({ functionVersion: '5' });
  });

  it('should append releaseVersion when RELEASE_VERSION env var is set', async () => {
    // Arrange - define mock lambda
    process.env.RELEASE_VERSION = 'v1.2.3';
    const mockLogger = { appendKeys: vi.fn() } as unknown as Logger;
    const fn = middy().use(appendFunctionVersion(mockLogger)).handler(vi.fn());

    // Act
    await fn({}, mockContext);

    // Expect
    expect(mockLogger.appendKeys).toHaveBeenCalledWith({ releaseVersion: 'v1.2.3' });
  });

  it('should not append releaseVersion when RELEASE_VERSION env var is not set', async () => {
    // Arrange - define mock lambda
    const mockLogger = { appendKeys: vi.fn() } as unknown as Logger;
    const fn = middy().use(appendFunctionVersion(mockLogger)).handler(vi.fn());

    // Act
    await fn({}, mockContext);

    // Expect
    expect(mockLogger.appendKeys).not.toHaveBeenCalledWith(
      expect.objectContaining({ releaseVersion: expect.anything() })
    );
  });
});
