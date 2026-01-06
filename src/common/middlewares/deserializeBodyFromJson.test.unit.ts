import { ITypedRequestEvent } from '@common/middlewares/interfaces';
import middy from '@middy/core';
import { Context } from 'aws-lambda';
import { deserializeBodyFromJson } from './deserializeBodyFromJson';

describe('deserializeBodyFromJson', () => {
  let instance = deserializeBodyFromJson();
  let mockContext: Context;
  let mockEvent: ITypedRequestEvent<string>;

  beforeEach(() => {
    instance = deserializeBodyFromJson();

    // Mock AWS Lambda Context
    mockContext = {} as unknown as Context;
  });

  it('should parse serialized JSON', async () => {
    // Arrange - define mock lambda
    const handler = vi.fn();
    const fn = middy().use(instance).handler(handler);
    const json = JSON.stringify({ a: 1, b: 'two' });

    // Act
    await fn({ body: json } as unknown as typeof mockEvent, mockContext);

    // Expect
    expect(handler).toHaveBeenCalledWith({ body: JSON.parse(json) }, mockContext, expect.any(Object));
  });

  it('should not parse objects', async () => {
    // Arrange - define mock lambda
    const handler = vi.fn();
    const fn = middy().use(instance).handler(handler);
    const obj = { a: 1, b: 'two' };

    // Act
    await fn({ body: obj } as unknown as typeof mockEvent, mockContext);

    // Expect
    expect(handler).toHaveBeenCalledWith({ body: obj }, mockContext, expect.any(Object));
  });
});
