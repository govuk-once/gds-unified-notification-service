// Unbound methods are allowed as that's how vi.mocked works
import * as awsCredentialsProvider from '@aws-sdk/credential-providers';
import { ProcessingAdapterUDP, ProcessingAdapterVoid, ProcessingService } from '@common/services';
import { ProcessingAdapterRequest } from '@common/services/interfaces';
import { EnumParameters, StringParameters } from '@common/utils';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { iocSpies } from '@common/utils/mockInstanceFactory.test.util';
import { Mocked } from 'vitest';

vi.mock(import('@smithy/signature-v4'), () => {
  const SignatureV4 = vi.fn(
    class {
      sign = vi.fn().mockResolvedValue({
        headers: {
          Authorization: 'abc123',
          'X-Amz-Date': '20180116T0000000Z',
          'X-Amz-Security-Token': 'cde456',
          'X-Amz-Content-Sha256': 'fgh789',
          host: 'aws',
        },
      });
    }
  );
  return { SignatureV4 } as unknown as typeof import('@smithy/signature-v4');
});

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });
vi.mock('@common/services/smConfigurationService', { spy: true });
vi.mock('@common/adapters/processingAdapterUDP', { spy: true });
vi.mock('@aws-sdk/credential-providers', { spy: true });

describe('ProcessingService', () => {
  const awsCredentialsProviderSpy = awsCredentialsProvider as Mocked<typeof awsCredentialsProvider>;
  awsCredentialsProviderSpy.fromTemporaryCredentials.mockImplementation(
    () =>
      ({
        sign: () => ({}),
      }) as unknown as ReturnType<(typeof awsCredentialsProvider)['fromTemporaryCredentials']>
  );
  awsCredentialsProviderSpy.fromNodeProviderChain.mockImplementation(
    () =>
      ({
        sign: () => ({}),
      }) as unknown as ReturnType<(typeof awsCredentialsProvider)['fromNodeProviderChain']>
  );
  let instance: ProcessingService;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, awsClientMocks, serviceMocks } = iocSpies();

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

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    serviceMocks.configurationServiceMock.getParameter.mockImplementation(
      mockGetParameterImplementation(mockParameterStore)
    );

    // Mock SM Value return
    serviceMocks.smConfigurationServiceMock.getParameter.mockResolvedValueOnce(JSON.stringify(mockSMContents));

    instance = new ProcessingService(
      observabilityMocks,
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
      expect(observabilityMocks.logger.info).toHaveBeenCalledWith(
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
      expect(observabilityMocks.logger.info).toHaveBeenCalledWith(
        `Processing using UDP adapter - mapping userID to externalUserID`,
        {
          userID: mockRequest.userID,
        }
      );
      expect(result.externalUserID).toEqual('bob:app:push:id');
    });
  });
});
