import { OrganisationsDynamoRepository } from '@common/repositories/organisationDynamoRepository';
import { StringParameters } from '@common/utils';
import {
  iocSpies,
  mockIOrganisationRecord,
  mockIProcessedMessage,
  mockIProcessedMessageRecord,
  mockServicesExpectedBehaviour,
} from '@test/mocks';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/util-dynamodb', { spy: true });

vi.mock('@common/services', { spy: true });

describe('OrganisationsDynamoRepository', () => {
  let instance: OrganisationsDynamoRepository;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, awsClientMocks, serviceMocks } = iocSpies();

  // Test Fixtures
  const organisationRecord = mockIOrganisationRecord();
  const message = mockIProcessedMessage();
  const messageRecord = mockIProcessedMessageRecord(message);
  const organisationRecord_02 = mockIOrganisationRecord('ORG_02', 'OTHER_ORG');
  const message_02 = mockIProcessedMessage('ORG_02');
  const messageRecord_02 = mockIProcessedMessageRecord(message_02);

  beforeEach(async () => {
    // Reset all mock
    vi.resetAllMocks();

    // Mock SSM store and services responses
    mockServicesExpectedBehaviour(serviceMocks);

    instance = new OrganisationsDynamoRepository(
      serviceMocks.configurationServiceMock,
      awsClientMocks.dynamoDBClientMock,
      observabilityMocks
    );
    await instance.initialize();
  });

  describe('create', () => {
    it('should call create with correct parameters and return this', async () => {
      // Arrange
      const create = vi
        .spyOn(Object.getPrototypeOf(OrganisationsDynamoRepository.prototype), 'create')
        .mockResolvedValue(undefined);

      // Act
      const result = await OrganisationsDynamoRepository.create(
        serviceMocks.configurationServiceMock,
        observabilityMock
      );

      // Assert
      expect(create).toHaveBeenCalledWith(StringParameters.Table.Organisations.Attributes);
      expect(result).toBe(instance);
    });
  });

  describe('GetOrganisations', () => {
    it('should return an organisation record for a notification', async () => {
      // Arrange
      instance.getRecord = vi.fn().mockResolvedValueOnce(organisationRecord);

      // Act
      const result = await instance.getOrganisations([messageRecord]);

      // Assert
      expect(result).toEqual([organisationRecord]);
    });

    it('should return an organisation record for multiple notifications', async () => {
      // Arrange
      instance.getRecord = vi
        .fn()
        .mockResolvedValueOnce(organisationRecord)
        .mockResolvedValueOnce(organisationRecord_02);

      // Act
      const result = await instance.getOrganisations([messageRecord, messageRecord_02]);

      // Assert
      expect(result).toEqual([organisationRecord, organisationRecord_02]);
    });

    it('should return organisation records for all successful get records and filter out any errors', async () => {
      // Arrange
      instance.getRecord = vi
        .fn()
        .mockResolvedValueOnce(organisationRecord)
        .mockRejectedValueOnce(new Error('AWS Failure.'));

      // Act
      const result = await instance.getOrganisations([messageRecord, messageRecord_02]);

      // Assert
      expect(result).toEqual([organisationRecord]);
    });

    it('should not return an empty array if no organisation is found for a notification', async () => {
      // Arrange
      instance.getRecord = vi.fn().mockResolvedValueOnce(null);

      // Act
      const result = await instance.getOrganisations([messageRecord]);

      // Assert
      expect(result).toEqual([]);
    });
  });
});
