import { GroupActionEnum } from '@project/lambdas';
import { test } from '@test/e2e/utils/setup.e2e.vitest';
import { v4 as uuid } from 'uuid';
import { expect } from 'vitest';

const pushID = uuid();
const url = (pushID?: string) => `/v1/groups${pushID ? `?pushID=${pushID}` : ''}`;
const testCase = (Namespace: string, Group: string, Subgroup?: string, Action?: string) => {
  return {
    Namespace,
    Group,
    Subgroup,
    Action,
  };
};

describe('POST {{flex}}/groups?pushID={{pushID}} - Modify groups', () => {
  describe(`Unhappy paths`, () => {
    test('ECONNREFUSED when - attempting to use insecure protocol (http instead of https)', async ({
      flexAPIUsingInsecureProtocol: api,
    }) => {
      // Arrange
      const path = url(pushID);

      // Act & Assert
      await expect(
        api.post({
          path,
          body: [testCase('travel', 'france', 'DAILY', GroupActionEnum.JOIN)],
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: 'fetch failed',
          cause: expect.objectContaining({
            code: 'ECONNREFUSED',
          }),
        })
      );
    });

    test('status 403 when using invalid api key', async ({ flexAPIWithoutAPIKey: api }) => {
      // Arrange
      const path = url(pushID);

      // Act & Assert
      await expect(
        api.post({
          path,
          body: [testCase('travel', 'france', 'DAILY', GroupActionEnum.JOIN)],
        })
      ).rejects.toThrow(`API [POST] ${path} Failed with 403`);
    });

    test('status 400 when -  missing pushID', async ({ flexAPI: api }) => {
      // Arrange
      const path = url();

      // Act & Assert
      await expect(
        api.post({
          path,
          body: [testCase('travel', 'france', 'DAILY', GroupActionEnum.JOIN)],
        })
      ).rejects.toThrow(`API [POST] ${path} Failed with 400`);
    });

    test('status 400 when when - missing body', async ({ flexAPI: api }) => {
      // Arrange
      const path = url(pushID);

      // Act & Assert
      await expect(
        api.post({
          path,
          body: {},
        })
      ).rejects.toThrow(`API [POST] ${path} Failed with 400`);
    });
  });

  describe(`Happy paths`, () => {
    test.for([
      [
        {
          requestBody: [testCase('travel', 'france', 'DAILY', GroupActionEnum.JOIN)],
          responseBody: [testCase('travel', 'france', 'DAILY')],
          when: 'joining a group successfully',
        },
      ],
      [
        {
          requestBody: [testCase('travel', 'france', 'DAILY', GroupActionEnum.LEAVE)],
          responseBody: [],
          when: 'leaving a group successfully',
        },
      ],
      [
        {
          requestBody: [
            testCase('travel', 'france', 'DAILY', GroupActionEnum.JOIN),
            testCase('travel', 'spain', 'IMMEDIATE', GroupActionEnum.JOIN),
          ],
          responseBody: [testCase('travel', 'france', 'DAILY'), testCase('travel', 'spain', 'IMMEDIATE')],
          when: 'joining multiple groups successfully',
        },
      ],
      [
        {
          requestBody: [
            testCase('travel', 'portugal', 'DAILY', GroupActionEnum.JOIN),
            testCase('travel', 'spain', 'IMMEDIATE', GroupActionEnum.LEAVE),
          ],
          responseBody: [testCase('travel', 'france', 'DAILY'), testCase('travel', 'portugal', 'DAILY')],
          when: 'leaving and join groups successfully',
        },
      ],
      [
        {
          requestBody: [
            testCase('travel', 'portugal', 'DAILY', GroupActionEnum.LEAVE),
            testCase('travel', 'france', 'DAILY', GroupActionEnum.LEAVE),
          ],
          responseBody: [],
          when: 'leaving multiple groups successfully',
        },
      ],
      [
        {
          requestBody: [testCase('driving', 'weather', undefined, GroupActionEnum.JOIN)],
          responseBody: [],
          when: 'joining a group without a subgroup',
        },
      ],
      [
        {
          requestBody: [testCase('driving', 'weather', undefined, GroupActionEnum.LEAVE)],
          responseBody: [],
          when: 'leaving a group without a subgroup',
        },
      ],
    ])(
      'status 200 and list of users groups when - $when',
      async ([{ requestBody, responseBody }], { flexAPI: api }) => {
        // Arrange
        const path = url(pushID);

        // Act
        const { status, body } = await api.post({ path: `${path}`, body: requestBody });

        // Assert
        expect(status).toEqual(200);
        expect(body).toEqual(expect.arrayContaining(responseBody));
      }
    );
  });
});
