/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ChannelsEnum } from '@common/models';
import { QueueEvent } from '@common/operations/queueOperation';
import { Context, ScheduledEvent } from 'aws-lambda';

/**
 * Queue Events
 */
export const mockEventContext = (functionName: string): Context =>
  ({
    functionName: functionName,
    awsRequestId: '12345',
  }) as unknown as Context;

export const mockQueueEvent = <T>(body: T): QueueEvent<T> => ({
  Records: [
    {
      messageId: 'mockMessageId_1',
      receiptHandle: 'mockReceiptHandle',
      attributes: {
        ApproximateReceiveCount: '2',
        SentTimestamp: '202601021513',
        SenderId: 'mockSenderId',
        ApproximateFirstReceiveTimestamp: '202601021513',
      },
      messageAttributes: {},
      md5OfBody: 'mockMd5OfBody',
      md5OfMessageAttributes: 'mockMd5OfMessageAttributes',
      eventSource: 'aws:sqs',
      eventSourceARN: 'mockEventSourceARN',
      awsRegion: 'eu-west2',
      body: body,
    },
  ],
});

export const mockQueueMultiEvents = <T>(body: T[]): QueueEvent<T> => ({
  Records: body.map((b, index) => ({
    messageId: `mockMessageId_${index}`,
    receiptHandle: 'mockReceiptHandle',
    attributes: {
      ApproximateReceiveCount: `${body.length}`,
      SentTimestamp: '202601021513',
      SenderId: 'mockSenderId',
      ApproximateFirstReceiveTimestamp: '202601021513',
    },
    messageAttributes: {},
    md5OfBody: 'mockMd5OfBody',
    md5OfMessageAttributes: 'mockMd5OfMessageAttributes',
    eventSource: 'aws:sqs',
    eventSourceARN: 'mockEventSourceARN',
    awsRegion: 'eu-west2',
    body: b,
  })),
});

/**
 * Scheduled Events
 */
export const mockScheduledEvent = (): ScheduledEvent =>
  ({
    id: 'mockID',
    version: 'mockVersion',
    account: 'mockAccount',
    time: '2026-01-01T00:00:00',
    region: 'eu-west-2',
    resources: 'mockResources',
    source: 'mockResources',
  }) as unknown as ScheduledEvent;

/**
 * API Gateway Events
 */
export const mockPsoAPIEvent = <T>(parameters: {
  body?: T;
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
}) => ({
  body: parameters?.body ? JSON.stringify(parameters.body) : undefined,
  pathParameters: parameters?.pathParameters,
  queryStringParameters: parameters?.queryStringParameters,
  headers: parameters?.body
    ? {
        'x-api-key': 'mockApiKey',
        'Content-Type': `application/json`,
      }
    : {
        'x-api-key': 'mockApiKey',
      },
  requestContext: {
    requestTimeEpoch: 1428582896000,
    requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
    authorizer: {
      Organization: 'ORG01',
      OrganisationConfig: JSON.stringify({
        MessageRetention: {
          Allowed: false,
        },
        Channels: [],
      }),
    },
  },
});

export const mockAPIPostMessageEvent = <T>(body: T[]) => ({
  body: JSON.stringify(body),
  headers: {
    'x-api-key': 'mockApiKey',
    'Content-Type': `application/json`,
  },
  requestContext: {
    requestTimeEpoch: 1428582896000,
    requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
    authorizer: {
      Organization: 'ORG01',
      OrganisationConfig: JSON.stringify({
        MessageRetention: {
          Allowed: false,
        },
        Channels: [],
      }),
    },
  },
});

export const mockPsoAPIEventWithMessageRetention = <T>(body: T[]) => ({
  body: JSON.stringify(body),
  headers: {
    'x-api-key': 'mockApiKey',
    'Content-Type': `application/json`,
  },
  requestContext: {
    requestTimeEpoch: 1428582896000,
    requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
    authorizer: {
      Organization: 'ORG01',
      OrganisationConfig: JSON.stringify({
        MessageRetention: {
          Allowed: true,
          Min: 10,
          Max: 35,
        },
        Channels: [],
      }),
    },
  },
});

export const mockPsoAPIEventWithChannelsControl = <T>(body: T[]) => ({
  body: JSON.stringify(body),
  headers: {
    'x-api-key': 'mockApiKey',
    'Content-Type': `application/json`,
  },
  requestContext: {
    requestTimeEpoch: 1428582896000,
    requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
    authorizer: {
      Organization: 'ORG01',
      OrganisationConfig: JSON.stringify({
        MessageRetention: {
          Allowed: false,
        },
        Channels: [ChannelsEnum.PUSH_NOTIFICATION_AND_MESSAGE_CENTRE, ChannelsEnum.MESSAGE_CENTRE_ONLY],
      }),
    },
  },
});

export const mockUnauthorizedPsoAPIEvent = <T>(body: T) => ({
  ...mockPsoAPIEvent({ body }),
  requestContext: {
    requestTimeEpoch: 1428582896000,
    requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
  },
});

export const mockEventWithCertificate = () => ({
  requestContext: {
    identity: {
      clientCert: {
        clientCertPem: `MOCK_CERTIFICATE_CONTENT`,
      },
    },
  },
});

export const mockFlexAPIEvent = <T>(parameters: {
  body?: T;
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
}) => ({
  body: parameters?.body ? JSON.stringify(parameters.body) : undefined,
  pathParameters: parameters?.pathParameters,
  queryStringParameters: parameters?.queryStringParameters,
  headers: parameters?.body
    ? {
        'x-api-key': 'mockApiKey',
        'Content-Type': `application/json`,
      }
    : {
        'x-api-key': 'mockApiKey',
      },
  requestContext: {
    requestTimeEpoch: 1428582896000,
    requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
  },
});

/**
 * mTLS Cert Policies
 */
export const mockAllowPolicy = () => {
  const expectedAllowPolicy = expect.objectContaining({
    policyDocument: expect.objectContaining({
      Statement: [
        expect.objectContaining({
          Effect: 'Allow',
        }),
      ],
    }),
  });
  return expectedAllowPolicy;
};
export const mockDenyPolicy = () => {
  const expectedDenyPolicy = expect.objectContaining({
    policyDocument: expect.objectContaining({
      Statement: [
        expect.objectContaining({
          Effect: 'Deny',
        }),
      ],
    }),
  });
  return expectedDenyPolicy;
};
