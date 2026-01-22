import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { Configuration } from '@common/services/configuration';
import { mockClient } from 'aws-sdk-client-mock';

describe('Configuration', () => {
  const ssmMock = mockClient(SSMClient);

  const trace = vi.fn();
  const error = vi.fn();

  let config: Configuration;

  beforeEach(() => {
    // Reset all mock
    vi.clearAllMocks();
    ssmMock.reset();

    config = new Configuration(
      { trace, error } as unknown as Logger,
      {} as unknown as Metrics,
      {} as unknown as Tracer
    );
  });

  describe('getParameter', () => {
    it('should secret from parameter store with namespace and value', async () => {
      // Arrange
      const secretValue = 'secret';
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: secretValue },
      });

      // Act
      const parameter = await config.getParameter('testNameSpace');

      // Assert
      expect(parameter).toEqual(secretValue);
    });

    it('should throw an error and log when the call fails', async () => {
      // Arrange
      const errorMsg = 'AWS Error';
      ssmMock.on(GetParameterCommand).rejects(new Error(errorMsg));

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
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: secretValue },
      });

      // Act
      const parameter = await config.getBooleanParameter('testNameSpace');

      // Assert
      expect(parameter).toEqual(true);
    });

    it('should throw an error and log when the parameter cannot be parsed to a boolean', async () => {
      // Arrange
      const secretValue = '1';

      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: secretValue },
      });

      // Act
      const result = config.getBooleanParameter('testNameSpace');

      // Assert
      await expect(result).rejects.toThrow(Error);
      expect(error).toHaveBeenCalledWith(`Could not parse parameter testNameSpace to a boolean`);
    });
  });

  describe('getNumericParameter', () => {
    it('should return a secret from parameter store in number form', async () => {
      // Arrange
      const secretValue = '10';
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: secretValue },
      });

      // Act
      const parameter = await config.getNumericParameter('testNameSpace');

      // Assert
      expect(parameter).toEqual(Number(secretValue));
    });

    it('should throw an error and log when the parameter cannot be parsed to a number', async () => {
      // Arrange
      const secretValue = 'ten';
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: secretValue },
      });

      const errorMsg = 'Could not parse parameter testNameSpace to a number';

      // Act
      const result = config.getNumericParameter('testNameSpace');

      // Assert
      await expect(result).rejects.toThrow(new Error(errorMsg));
      expect(error).toHaveBeenCalledWith(errorMsg);
    });
  });
});
