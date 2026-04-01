/* eslint-disable @typescript-eslint/unbound-method */
// Unbound methods are allowed as that's how vi.mocked works
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { ProcessingAdapterUDP, ProcessingAdapterVoid, ProcessingService } from '@common/services';
import { ProcessingAdapterRequest } from '@common/services/interfaces';
import { EnumParameters, StringParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { mockClient } from 'aws-sdk-client-mock';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });
vi.mock('@common/services/smConfigurationService', { spy: true });
vi.mock('@common/adapters/processingAdapterUDP', { spy: true });

describe('ProcessingService', () => {
  const smMock = mockClient(SecretsManagerClient);
  const stsMock = mockClient(STSClient);
  stsMock.on(AssumeRoleCommand).resolvesOnce({
    Credentials: {
      AccessKeyId: '1',
      SecretAccessKey: '2',
      SessionToken: '3',
      Expiration: new Date(Date.now() + 3600 * 1000),
    },
  });

  let instance: ProcessingService;

  // Initialize the mock service and repository layers
  const observabilityMock = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMock);

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // Mock request
  const mockRequest: ProcessingAdapterRequest = {
    userID: 'bob',
  };
  const mockSMContents = {
    apiAccountId: '1231231231',
    apiKey: 'abc',
    apiUrl: 'https://udp',
    consumerRoleArn: 'arn:iam:consumer',
    region: 'eu-west-2',
  };

  beforeEach(() => {
    // Reset all mock
    vi.clearAllMocks();

    smMock.reset();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    // Mock SM Value return
    serviceMocks.smConfigurationServiceMock.getParameter.mockResolvedValueOnce(JSON.stringify(mockSMContents));

    instance = new ProcessingService(
      observabilityMock,
      serviceMocks.configurationServiceMock,
      serviceMocks.smConfigurationServiceMock
    );
  });

  describe('initialize', () => {
    it('should fetch data from configuration service and initialize relevant adapter (void)', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Processing.Adapter] = 'VOID';

      // Act
      await instance.initialize();

      // Assert
      expect(serviceMocks.configurationServiceMock.getEnumParameter).toHaveBeenCalledTimes(1);
      expect(instance.adapter instanceof ProcessingAdapterVoid).toEqual(true);
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledTimes(1);
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith(
        EnumParameters.Config.Processing.Adapter
      ); // Void Adapter should make not further param calls
    });

    it('should fetch data from configuration service and initialize relevant adapter (UDP)', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Processing.Adapter] = 'UDP';
      const expectedParamCalls = [EnumParameters.Config.Processing.Adapter, StringParameters.UDP.Config.SM];

      // Act
      await instance.initialize();

      // Assert
      expect(serviceMocks.configurationServiceMock.getEnumParameter).toHaveBeenCalledTimes(1); //
      expect(instance.adapter instanceof ProcessingAdapterUDP).toEqual(true);
      for (const param of expectedParamCalls) {
        expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledWith(param);
      }
      expect(serviceMocks.configurationServiceMock.getParameter).toHaveBeenCalledTimes(expectedParamCalls.length);
    });
  });

  describe('send', () => {
    it('Sends a request to the void when using Void adapter', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Processing.Adapter] = 'VOID';

      // Act
      await instance.initialize();
      await instance.send(mockRequest);

      // Assert
      expect(observabilityMock.logger.info).toHaveBeenCalledWith(
        `Processing using Void adapter - mapping userID to externalUserID`,
        {
          userID: mockRequest.userID,
        }
      );
    });
    it('Sends a request to the UDP when using UDP Adapter', async () => {
      // Arrange
      mockParameterStore[EnumParameters.Config.Processing.Adapter] = 'UDP';

      // Act
      await instance.initialize();
      const result = await instance.send(mockRequest);

      // Assert

      expect(observabilityMock.logger.info).toHaveBeenCalledWith(
        `Processing using UDP adapter - mapping userID to externalUserID`,
        {
          userID: mockRequest.userID,
        }
      );
      expect(result.externalUserID).toEqual('bob:app:push:id');
    });
  });
});
