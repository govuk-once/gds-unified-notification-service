/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ConfigurationService } from '@common/services/configurationService';
import { mockClient } from 'aws-sdk-client-mock';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

describe('ConfigurationService', () => {
  let config: ConfigurationService;

  const ssmMock = mockClient(SSMClient);
  const loggerMock = vi.mocked(new Logger());
  const metricsMock = vi.mocked(new Metrics());
  const tracerMock = vi.mocked(new Tracer());

  beforeEach(() => {
    // Reset all mock
    vi.clearAllMocks();
    ssmMock.reset();

    config = new ConfigurationService(loggerMock, metricsMock, tracerMock);
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
      await config.getParameter('testNameSpace');

      // Assert
      expect(loggerMock.error).toHaveBeenCalledWith(`Failed fetching value from SSM - Error: ${errorMsg}`);
    });
  });

  describe('getBooleanParameter', () => {
    it('should return true from parameter store in boolean form', async () => {
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

    it('should return false from parameter store in boolean form', async () => {
      // Arrange
      const secretValue = 'false';
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: secretValue },
      });

      // Act
      const parameter = await config.getBooleanParameter('testNameSpace');

      // Assert
      expect(parameter).toEqual(false);
    });

    it('should throw an error and log when the parameter cannot be parsed to a boolean', async () => {
      // Arrange
      const secretValue = '1';

      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: secretValue },
      });

      // Act
      await config.getBooleanParameter('testNameSpace');

      // Assert
      expect(loggerMock.error).toHaveBeenCalledWith(`Could not parse parameter testNameSpace to a boolean`);
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

    it('should log an error when the parameter is undefined', async () => {
      // Arrange
      const secretValue = undefined;
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: secretValue },
      });

      const errorMsg = 'Could not parse parameter testNameSpace to a number';

      // Act
      await config.getNumericParameter('testNameSpace');

      // Assert
      expect(loggerMock.error).toHaveBeenCalledWith(errorMsg);
    });

    it('should log an error when the parameter cannot be parsed to a number', async () => {
      // Arrange
      const secretValue = 'ten';
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: secretValue },
      });

      const errorMsg = 'Could not parse parameter testNameSpace to a number';

      // Act
      await config.getNumericParameter('testNameSpace');

      // Assert
      expect(loggerMock.error).toHaveBeenCalledWith(errorMsg);
    });
  });
});
