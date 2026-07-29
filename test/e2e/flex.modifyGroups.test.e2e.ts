import { GroupActionEnum } from '@project/lambdas';
import { test } from '@test/e2e/utils/setup.e2e.vitest';
import { expect } from 'vitest';

const url = (pushID?: string) => `/v1/groups${pushID ? `/?pushID=${pushID}` : ''}`;
const bodyToJoin = [
  {
    Namespace: 'travel',
    Group: 'france',
    Subgroup: 'IMMEDIATE',
    Action: GroupActionEnum.JOIN,
  },
];
const bodyToLeave = [
  {
    Namespace: 'travel',
    Group: 'france',
    Subgroup: 'IMMEDIATE',
    Action: GroupActionEnum.LEAVE,
  },
];
const bodyToLeaveSpain = [
  {
    Namespace: 'travel',
    Group: 'spain',
    Subgroup: 'DAILY',
    Action: GroupActionEnum.LEAVE,
  },
];
const bodyToLeaveAndJoin = [
  {
    Namespace: 'travel',
    Group: 'france',
    Subgroup: 'IMMEDIATE',
    Action: GroupActionEnum.LEAVE,
  },
  {
    Namespace: 'travel',
    Group: 'spain',
    Subgroup: 'DAILY',
    Action: GroupActionEnum.JOIN,
  },
];

describe('POST {{flex}}/groups?pushID={{pushID}} - Modify groups', () => {
  describe(`Unhappy paths`, () => {
    test('ECONNREFUSED when - attempting to use insecure protocol (http instead of https)', async ({
      flexAPIUsingInsecureProtocol: api,
      validPushID,
    }) => {
      // Arrange
      const path = url(validPushID);

      // Act & Assert
      await expect(
        api.post({
          path,
          body: bodyToLeaveAndJoin,
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

    test('status 403 when using invalid api key', async ({ flexAPIWithoutAPIKey: api, validPushID }) => {
      // Arrange
      const path = url(validPushID);

      // Act & Assert
      await expect(
        api.post({
          path,
          body: bodyToLeaveAndJoin,
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
          body: bodyToLeaveAndJoin,
        })
      ).rejects.toThrow(`API [POST] ${path} Failed with 400`);
    });

    test('status 400 when when - missing body', async ({ flexAPI: api, validPushID }) => {
      // Arrange
      const path = url(validPushID);

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
    test('status 200 and list of users groups when - joining a group successfully', async ({
      flexAPI: api,
      validPushID,
    }) => {
      // Arrange
      const path = url(validPushID);

      // Act
      const { status, body } = await api.post({ path: `${path}?pushID=${validPushID}`, body: bodyToJoin });

      // Assert
      expect(status).toEqual(200);
      expect(body).toEqual([
        {
          Namespace: 'travel',
          Group: 'france',
          Subgroup: 'IMMEDIATE',
        },
      ]);
    });

    test('status 200 and list of users groups when - leaving a group successfully', async ({
      flexAPI: api,
      validPushID,
    }) => {
      // Arrange
      const path = url(validPushID);

      // Act
      const { status, body } = await api.post({ path: `${path}?pushID=${validPushID}`, body: bodyToLeave });

      // Assert
      expect(status).toEqual(200);
      expect(body).toEqual([
        {
          Namespace: 'travel',
          Group: 'france',
          Subgroup: 'IMMEDIATE',
        },
      ]);
    });

    test('status 200 and list of users groups when - leaving and joining groups successfully', async ({
      flexAPI: api,
      validPushID,
    }) => {
      // Arrange
      const path = url(validPushID);
      await api.post({ path: `${path}?pushID=${validPushID}`, body: bodyToJoin }); // Creating a group that can be left

      // Act
      const { status, body } = await api.post({ path: `${path}?pushID=${validPushID}`, body: bodyToLeaveAndJoin });

      // Assert
      expect(status).toEqual(200);
      expect(body).toEqual([
        {
          Namespace: 'travel',
          Group: 'spain',
          Subgroup: 'DAILY',
        },
      ]);
    });

    test('status 200 and list of users groups when - leaving a group the user is not part of (skip)', async ({
      flexAPI: api,
      validPushID,
    }) => {
      // Arrange
      const path = url(validPushID);

      // Act
      const { status, body } = await api.post({ path: `${path}?pushID=${validPushID}`, body: bodyToLeave });

      // Assert
      expect(status).toEqual(200);
      expect(body).toEqual([
        {
          Namespace: 'travel',
          Group: 'spain',
          Subgroup: 'DAILY',
        },
      ]);
    });

    test('status 200 and empty array when - a user is part of no group after leaving', async ({
      flexAPI: api,
      validPushID,
    }) => {
      // Arrange
      const path = url(validPushID);
      const bodyToLeaveAllTestGroups = [
        bodyToLeave[0],
        {
          Namespace: 'travel',
          Group: 'spain',
          Subgroup: 'DAILY',
          Action: GroupActionEnum.LEAVE,
        },
      ];

      // Act
      const { status, body } = await api.post({
        path: `${path}?pushID=${validPushID}`,
        body: bodyToLeaveAllTestGroups,
      });

      // Assert
      expect(status).toEqual(200);
      expect(body).toEqual([]);
    });
  });
});
