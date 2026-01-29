/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ConfigurationService } from '@common/services/configurationService';
import { mockClient } from 'aws-sdk-client-mock';
import { Mocked } from 'vitest';
import z from 'zod';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

describe('ConfigurationService', () => {
  let config: ConfigurationService;

  const ssmMock = mockClient(SSMClient);
  const loggerMock = new Logger() as Mocked<Logger>;
  const metricsMock = new Metrics() as Mocked<Metrics>;
  const tracerMock = new Tracer() as Mocked<Tracer>;

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
      const result = config.getParameter('testNameSpace');

      // Assert
      await expect(result).rejects.toThrow(new Error(errorMsg));
      expect(loggerMock.error).toHaveBeenCalledWith(
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
      expect(loggerMock.error).toHaveBeenCalledWith(`Could not parse parameter testNameSpace to a boolean`);
    });
  });

  describe('getNumericParameter', () => {
    it('should return a secret from parameter store in numeric form', async () => {
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
      expect(loggerMock.error).toHaveBeenCalledWith(errorMsg);
    });
  });

  describe('getEnumParameter', () => {
    const enumValues = z.enum([`blue`, `green`]);

    it('should return a secret from parameter store in enum form', async () => {
      // Arrange
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: enumValues.enum.blue },
      });

      // Act
      const parameter = await config.getEnumParameter('testNameSpace', enumValues);

      // Assert
      expect(parameter).toEqual(enumValues.enum.blue);
    });

    it('should throw an error and log when the parameter cannot be parsed to a enum', async () => {
      // Arrange
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: 'yellow' },
      });

      const errorMsg = 'Could not parse parameter testNameSpace to a enum';

      // Act
      const result = config.getEnumParameter('testNameSpace', enumValues);

      // Assert
      await expect(result).rejects.toThrow(new Error(errorMsg));
      expect(loggerMock.error).toHaveBeenCalledWith(errorMsg, { method: 'getEnumParameter' });
    });
  });
});
