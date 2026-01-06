import { IRequestEvent } from '@common/middlewares/interfaces';
import { serializeBodyToJson } from '@common/middlewares/serializeBodyToJson';
import middy from '@middy/core';
import { Context } from 'aws-lambda';

describe('serializeBodyToJson', () => {
  const mockContext = {} as Context;
  const instance = serializeBodyToJson();

  it('should do nothing if request body is not defined', async () => {
    // Arrange - define mock lambda
    const handler = vi.fn().mockResolvedValueOnce({ body: undefined });
    const fn = middy().use(instance).handler(handler);

    // Act
    const result = await fn({} as IRequestEvent, mockContext);

    // Expect
    expect(result).toEqual({ body: undefined });
  });

  it('should serialize objects', async () => {
    // Arrange - define mock lambda
    const obj = { a: 1, b: 'two' };
    const handler = vi.fn().mockResolvedValueOnce({ body: obj });
    const fn = middy().use(instance).handler(handler);

    // Act
    const result = await fn({} as IRequestEvent, mockContext);

    // Expect
    expect(result).toEqual({ body: JSON.stringify(obj, null, 2) });
  });
});
