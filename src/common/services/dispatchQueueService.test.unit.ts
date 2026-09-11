import { DispatchQueueService } from '@common/services/dispatchQueueService';
import { StringParameters } from '@common/utils';
import { iocSpies, mockServicesExpectedBehaviour } from '@test/mocks';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@aws-sdk/client-sqs', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });

describe('DispatchQueueService', async () => {
  let dispatchQueueService: DispatchQueueService;

  // Observability and Service mocks
  // Initialize mock services, clients, and repositories
  const { observabilityMocks, awsClientMocks, serviceMocks } = await iocSpies();

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();

    // Mock SSM store and services responses
    mockServicesExpectedBehaviour(serviceMocks);

    dispatchQueueService = await DispatchQueueService.create(
      serviceMocks.configurationServiceMock,
      observabilityMocks,
      awsClientMocks.sqsClientMock
    );
  });

  describe('getQueueName', () => {
    it('should have return the correct queue name', () => {
      // Act
      const result = dispatchQueueService.getQueueName();

      // Assert
      expect(result).toBe('dispatch');
    });
  });

  describe('initialize', () => {
    it('should retrieve the queue url and log when the dispatch queue service is initialised.', async () => {
      // Act
      const result = await DispatchQueueService.create(
        serviceMocks.configurationServiceMock,
        observabilityMocks,
        awsClientMocks.sqsClientMock
      );

      // Assert
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith(
        StringParameters.Queue.Dispatch.Url
      );
      expect(result).toBeInstanceOf(DispatchQueueService);
    });
  });
});
