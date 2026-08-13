import { IGroupMessage } from '@project/lambdas';
import { describe, expect, it } from 'vitest';
import { generateNotificationIDForGroupMessage, md5ToUuidV4 } from './checksumString';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('md5ToUuidV4', () => {
  it('should generate a valid UUID v4 string from any generic object', () => {
    // Arrange
    const inputObject = { key1: 'value1', key2: 123 };

    // Act
    const result = md5ToUuidV4(inputObject);

    // Assert
    expect(result).toMatch(UUID_V4_REGEX);
    expect(result).toHaveLength(36);
  });

  it('should be deterministic when given the exact same object values', () => {
    // Arrange
    const objA = { a: 'foo', b: 'bar' };
    const objB = { a: 'foo', b: 'bar' };
    const uuidB = md5ToUuidV4(objB);

    // Act
    const uuidA = md5ToUuidV4(objA);

    // Assert
    expect(uuidA).toBe(uuidB);
  });

  it('should set version 4 and variant 1 bits correctly', () => {
    // Arrange
    const inputObject = { test: 'bit_check' };

    // Act
    const result = md5ToUuidV4(inputObject);

    // 3. Assert
    const parts = result.split('-');
    expect(parts[2][0]).toBe('4');
    expect(['8', '9', 'a', 'b']).toContain(parts[3][0].toLowerCase());
  });
});

describe('generateNotificationIDForGroupMessage', () => {
  // Shared mock fixture for tests
  const mockPushID = 'push_abc123';
  const mockGroupMessage: IGroupMessage = {
    GroupNotificationID: 'grp_789',
    CampaignID: 'TO_GROUP_CAM',
    OrganisationID: 'ORG_01',
    Namespace: 'travel',
    Group: 'france',
    Subgroup: 'immediate',
    NotificationTitle: 'New Group Message',
    NotificationBody: 'You have a new message in the team chat.',
    MessageTitle: 'Weekly Sync Update',
    MessageBody: 'Meeting has been moved to 3 PM.',
  };

  it('should generate a valid UUID v4 string for group message parameters', () => {
    // Act
    const result = generateNotificationIDForGroupMessage(mockPushID, mockGroupMessage);

    // Assert
    expect(result).toMatch(UUID_V4_REGEX);
  });

  it('should generate identical IDs when given identical input data', () => {
    // Arrange
    const pushID = 'push_123';
    const message = { ...mockGroupMessage };
    const id2 = generateNotificationIDForGroupMessage(pushID, message);

    // Act
    const id1 = generateNotificationIDForGroupMessage(pushID, message);

    // Assert
    expect(id1).toBe(id2);
  });

  it('should generate a different ID if PushID changes', () => {
    // Arrange
    const originalID = generateNotificationIDForGroupMessage('push_123', mockGroupMessage);

    // Act
    const updatedID = generateNotificationIDForGroupMessage('push_456', mockGroupMessage);

    // Assert
    expect(originalID).not.toBe(updatedID);
  });

  it('should generate a different ID if any mapped field in groupMessage changes', () => {
    // Arrange
    const modifiedGroupMessage: IGroupMessage = {
      ...mockGroupMessage,
      NotificationTitle: 'Updated Notification Title',
    };
    const modifiedID = generateNotificationIDForGroupMessage(mockPushID, modifiedGroupMessage);

    // Act
    const originalID = generateNotificationIDForGroupMessage(mockPushID, mockGroupMessage);

    // Assert
    expect(originalID).not.toBe(modifiedID);
  });
});
