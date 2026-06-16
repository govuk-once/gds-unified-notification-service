import { DynamoDB, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { OrganisationsDynamoRepository } from '@common/repositories/organisationDynamoRepository';
import { StringParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { IMessageRecord } from '@project/lambdas/interfaces/IMessageRecord';
import { IOrganisationRecord } from '@project/lambdas/interfaces/IOrganisationRecord';
import { mockClient } from 'aws-sdk-client-mock';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services', { spy: true });

describe('OrganisationsDynamoRepository', () => {
  let instance: OrganisationsDynamoRepository;

  // Initialize the mock service and repository layers
  const observabilityMock = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMock);
  const dynamoMock = mockClient(DynamoDB);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  beforeEach(async () => {
    // Reset all mock
    vi.resetAllMocks();
    dynamoMock.reset();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    instance = new OrganisationsDynamoRepository(serviceMocks.configurationServiceMock, observabilityMock);
    await instance.initialize();
  });

  describe('initialize', () => {
    it('should call super.initialize with correct parameters and return this', async () => {
      // Arrange
      const superInitialize = vi
        .spyOn(Object.getPrototypeOf(OrganisationsDynamoRepository.prototype), 'initialize')
        .mockResolvedValue(undefined);

      // Act
      const result = await instance.initialize();

      // Assert
      expect(superInitialize).toHaveBeenCalledWith(StringParameters.Table.Organisations.Attributes);
      expect(result).toBe(instance);
    });
  });

  describe('GetOrganisations', () => {
    it('should return an organisation record for a notification', async () => {
      // Arrange
      const mockOrganisationID = 'ORG01';
      const mockRecord_01: IOrganisationRecord = {
        OrganisationID: mockOrganisationID,
        DisplayName: 'ORG',
      };

      const mockMessageRecord: IMessageRecord = {
        NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d1',
        UserID: 'UserID',
        MessageTitle: 'You have a new Message',
        MessageBody: 'Open Notification Centre to read your notifications',
        NotificationTitle: 'You have a new medical driving license',
        NotificationBody: 'The DVLA has issued you a new license.',
        ReceivedDateTime: '202601021513',
        Events: [],
        OrganisationID: mockOrganisationID,
      };

      dynamoMock.on(GetItemCommand).resolvesOnce({
        Item: marshall(mockRecord_01),
      });

      // Act
      const result = await instance.getOrganisations([mockMessageRecord]);

      // Assert
      expect(result).toEqual([mockRecord_01]);
    });

    it('should return an organisation record for multiple notifications', async () => {
      // Arrange
      const mockOrganisationID_01 = 'ORG01';
      const mockOrganisationID_02 = 'ORG02';
      const mockRecord_01: IOrganisationRecord = {
        OrganisationID: mockOrganisationID_01,
        DisplayName: 'ORG',
      };
      const mockRecord_02: IOrganisationRecord = {
        OrganisationID: mockOrganisationID_02,
        DisplayName: 'OTHER_ORG',
      };

      const mockMessageRecord_01: IMessageRecord = {
        NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d1',
        UserID: 'UserID',
        MessageTitle: 'You have a new Message',
        MessageBody: 'Open Notification Centre to read your notifications',
        NotificationTitle: 'You have a new medical driving license',
        NotificationBody: 'The DVLA has issued you a new license.',
        ReceivedDateTime: '202601021513',
        Events: [],
        OrganisationID: 'ORG01',
      };
      const mockMessageRecord_02: IMessageRecord = {
        NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d2',
        UserID: 'UserID',
        MessageTitle: 'You have a new Message',
        MessageBody: 'Open Notification Centre to read your notifications',
        NotificationTitle: 'You have a new medical driving license',
        NotificationBody: 'The DVLA has issued you a new license.',
        ReceivedDateTime: '202601021513',
        Events: [],
        OrganisationID: 'ORG02',
      };

      dynamoMock
        .on(GetItemCommand)
        .resolvesOnce({
          Item: marshall(mockRecord_01),
        })
        .resolvesOnce({
          Item: marshall(mockRecord_02),
        });

      // Act
      const result = await instance.getOrganisations([mockMessageRecord_01, mockMessageRecord_02]);

      // Assert
      expect(result).toEqual([mockRecord_01, mockRecord_02]);
    });

    it('should not return an empty array if no organisation is found for a notification', async () => {
      // Arrange
      const mockOrganisationID = 'ORG01';
      const mockMessageRecord: IMessageRecord = {
        NotificationID: '2536bd9b-611b-453c-ba3d-e34783e4c9d1',
        UserID: 'UserID',
        MessageTitle: 'You have a new Message',
        MessageBody: 'Open Notification Centre to read your notifications',
        NotificationTitle: 'You have a new medical driving license',
        NotificationBody: 'The DVLA has issued you a new license.',
        ReceivedDateTime: '202601021513',
        Events: [],
        OrganisationID: mockOrganisationID,
      };

      dynamoMock.on(GetItemCommand).resolvesOnce({
        Item: undefined,
      });

      // Act
      const result = await instance.getOrganisations([mockMessageRecord]);

      // Assert
      expect(result).toEqual([]);
    });
  });
});
