import { GroupActionEnum } from '@project/lambdas';
import { test } from '@test/e2e/utils/setup.e2e.vitest';
import { v4 as uuid } from 'uuid';
import { expect } from 'vitest';

const pushID = uuid();
const url = (pushID?: string) => `/v1/groups${pushID ? `?pushID=${pushID}` : ''}`;
const testCase = (Namespace: string, Group: string, Subgroup?: string, Action?: string) => ({
  Namespace,
  Group,
  Subgroup,
  Action,
});

describe('GET {{flex}}/groups?pushID={{pushID}} - Get groups', () => {
  describe(`Unhappy paths`, () => {
    test('ECONNREFUSED when - attempting to use insecure protocol (http instead of https)', async ({
      flexAPIUsingInsecureProtocol: api,
    }) => {
      // Arrange
      const path = url(pushID);

      // Act & Assert
      await expect(
        api.get({
          path,
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
        api.get({
          path,
        })
      ).rejects.toThrow(`API [GET] ${path} Failed with 403`);
    });

    test('status 400 when -  missing pushID', async ({ flexAPI: api }) => {
      // Arrange
      const path = url();

      // Act & Assert
      await expect(
        api.get({
          path,
        })
      ).rejects.toThrow(`API [GET] ${path} Failed with 400`);
    });
  });

  describe(`Happy paths`, () => {
    test.for([
      [
        {
          groupRecord: [testCase('travel', 'france', 'DAILY', GroupActionEnum.JOIN)],
          responseBody: [testCase('travel', 'france', 'DAILY')],
          response: 'and a list of users groups when the user has one group',
          resetRecords: [testCase('travel', 'france', 'DAILY', GroupActionEnum.LEAVE)],
        },
      ],
      [
        {
          groupRecord: [
            testCase('travel', 'france', 'DAILY', GroupActionEnum.JOIN),
            testCase('travel', 'spain', 'IMMEDIATE', GroupActionEnum.JOIN),
          ],
          responseBody: [testCase('travel', 'france', 'DAILY')],
          response: 'and  a list of users groups when the user has multiple group',
          resetRecords: [
            testCase('travel', 'france', 'DAILY', GroupActionEnum.LEAVE),
            testCase('travel', 'spain', 'IMMEDIATE', GroupActionEnum.LEAVE),
          ],
        },
      ],
      [
        {
          groupRecord: [testCase('driving', 'weather', undefined, GroupActionEnum.JOIN)],
          responseBody: [testCase('driving', 'weather')],
          response: 'and  a list of with a group with no subgroup when the users group has no subgroup',
          resetRecords: [testCase('driving', 'weather', undefined, GroupActionEnum.LEAVE)],
        },
      ],
      [
        {
          groupRecord: undefined,
          responseBody: [],
          response: 'and an empty array when the user has no groups',
          resetRecords: undefined,
        },
      ],
    ])('status 200 and $response', async ([{ groupRecord, responseBody, resetRecords }], { flexAPI: api }) => {
      // Arrange
      const path = url(pushID);
      if (groupRecord) {
        await api.post({ path: `${path}`, body: groupRecord });
      }

      // Act
      const { status, body } = await api.get({ path: `${path}` });

      // Assert
      expect(status).toEqual(200);
      expect(body).toEqual(expect.arrayContaining(responseBody));

      // Reset
      if (resetRecords) {
        await api.post({ path: `${path}`, body: resetRecords });
      }
    });
  });
});
