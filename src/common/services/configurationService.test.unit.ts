import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ConfigurationService } from '@common/services/configurationService';
import { mockClient } from 'aws-sdk-client-mock';

describe('ConfigurationService', () => {
  const ssmMock = mockClient(SSMClient);
  const trace = vi.fn();
  const error = vi.fn();

  let config: ConfigurationService;

  beforeEach(() => {
    // Reset all mock
    vi.clearAllMocks();
    ssmMock.reset();

    config = new ConfigurationService(
      { trace, error } as unknown as Logger,
      {} as unknown as Metrics,
      {} as unknown as Tracer
    );
  });

  describe('getParameter', () => {
    it('should secret from parameter store with namespace and value', async () => {
      // Arrange
      const secretValue = 'secret';
      ssmMock.on(GetParametersByPathCommand).resolves({
        Parameters: [{ Value: secretValue, Name: '/undefined/testKey' }],
      });

      // Act
      const parameter = await config.getParameter('testKey');

      // Assert
      expect(parameter).toEqual(secretValue);
    });

    it('should throw an error and log when the call fails', async () => {
      // Arrange
      const errorMsg = 'AWS Error';
      ssmMock.on(GetParametersByPathCommand).rejects(new Error(errorMsg));

      // Act
      const result = config.getParameter('testNameSpace');

      // Assert
      await expect(result).rejects.toThrow(new Error(errorMsg));
      expect(error).toHaveBeenCalledWith(
        `Failed fetching value from SSM - /undefined/testNameSpace Error: ${errorMsg}`
      );
    });
  });

  describe('getBooleanParameter', () => {
    it('should return a secret from parameter store in boolean form', async () => {
      // Arrange
      const secretValue = 'true';
      ssmMock.on(GetParametersByPathCommand).resolves({
        Parameters: [{ Value: secretValue, Name: '/undefined/testKey' }],
      });

      // Act
      const parameter = await config.getBooleanParameter('testKey');

      // Assert
      expect(parameter).toEqual(true);
    });

    it('should throw an error and log when the parameter cannot be parsed to a boolean', async () => {
      // Arrange
      const secretValue = 'abc';
      ssmMock.on(GetParametersByPathCommand).resolves({
        Parameters: [{ Value: secretValue, Name: '/undefined/testKey' }],
      });
      // Act
      const result = config.getBooleanParameter('testKey');

      // Assert
      await expect(result).rejects.toThrow(Error);
      expect(error).toHaveBeenCalledWith(`Could not parse parameter testKey to a boolean`);
    });
  });

  describe('getNumericParameter', () => {
    it('should return a secret from parameter store in number form', async () => {
      // Arrange
      const secretValue = '10';
      ssmMock.on(GetParametersByPathCommand).resolves({
        Parameters: [{ Value: secretValue, Name: '/undefined/testKey' }],
      });

      // Act
      const parameter = await config.getNumericParameter('testKey');

      // Assert
      expect(parameter).toEqual(Number(secretValue));
    });

    it('should throw an error and log when the parameter cannot be parsed to a number', async () => {
      // Arrange
      const secretValue = 'ten';
      ssmMock.on(GetParametersByPathCommand).resolves({
        Parameters: [{ Value: secretValue, Name: '/undefined/testKey' }],
      });

      const errorMsg = 'Could not parse parameter testKey to a number';

      // Act
      const result = config.getNumericParameter('testKey');

      // Assert
      await expect(result).rejects.toThrow(new Error(errorMsg));
      expect(error).toHaveBeenCalledWith(errorMsg);
    });
  });
});
