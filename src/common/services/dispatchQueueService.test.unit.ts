/* eslint-disable @typescript-eslint/unbound-method */
import { ConfigurationService } from '@common/services/configurationService';
import { DispatchQueueService } from '@common/services/dispatchQueueService';
import { MockConfigurationImplementation } from '@common/utils/mockConfigurationImplementation.test.unit.utils';
import { observabilitySpies } from '@common/utils/mockInstanceFactory.test.util';
import { toHaveReceivedCommandWith } from 'aws-sdk-client-mock-vitest';

expect.extend({
  toHaveReceivedCommandWith,
});

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });

describe('DispatchQueueService', () => {
  let instance: DispatchQueueService;

  // Observability and Service mocks
  const observabilityMock = observabilitySpies();
  const configurationServiceMock = vi.mocked(new ConfigurationService(observabilityMock));

  // Mocking implementation of the configuration service
  const mockConfigurationImplementation: MockConfigurationImplementation = new MockConfigurationImplementation();

  beforeEach(async () => {
    // Reset all mock
    vi.clearAllMocks();
    mockConfigurationImplementation.resetConfig();

    configurationServiceMock.getParameter = vi.fn().mockImplementation((namespace: string) => {
      return Promise.resolve(mockConfigurationImplementation.stringConfiguration[namespace]);
    });

    instance = new DispatchQueueService(configurationServiceMock, observabilityMock);
    await instance.initialize();
  });

  describe('initialize', () => {
    it('should retrieve the queue url and log when the dispatch queue service is initalised.', async () => {
      // Act
      const result = await instance.initialize();

      // Assert
      expectTypeOf(result).toEqualTypeOf<DispatchQueueService>();
      expect(observabilityMock.logger.info).toHaveBeenCalledWith('Dispatch Queue Service Initialised.');
    });
  });
});
