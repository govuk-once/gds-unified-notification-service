import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { Configuration } from '@common/services/configuration';
import { mockClient } from 'aws-sdk-client-mock';

const ssmMock = mockClient(SSMClient);
const config = new Configuration();

describe('Configuration', () => {
  beforeEach(() => {
    ssmMock.reset();
  });

  describe('getParameter', () => {
    it('should secret from parameter store with namespace and value', async () => {
      // Arrange
      const secretValue = 'secret';
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: secretValue },
      });

      // Act
      const parameter = await config.getParameter('testNameSpace', 'testKey');

      // Assert
      expect(parameter).toEqual(secretValue);
    });

    it('should throw an error and log when the call fails', async () => {
      // Arrange
      const trace = vi.spyOn(config.logger, 'trace');
      const error = new Error('AWS Error');

      ssmMock.on(GetParameterCommand).rejects(error);

      // Act
      const result = config.getParameter('testNameSpace', 'testKey');

      // Assert
      await expect(result).rejects.toThrow(error);
      expect(trace).toHaveBeenCalledWith(`Failed fetching value from SSM: ${error}`);
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
      const parameter = await config.getBooleanParameter('testNameSpace', 'testKey');

      // Assert
      expect(parameter).toEqual(true);
    });

    it('should throw an error and log when the parameter cannot be parsed to a boolean', async () => {
      // Arrange
      const trace = vi.spyOn(config.logger, 'trace');
      const secretValue = '1';

      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: secretValue },
      });

      // Act
      const result = config.getBooleanParameter('testNameSpace', 'testKey');

      // Assert
      await expect(result).rejects.toThrow(Error);
      expect(trace).toHaveBeenCalledWith(`Could not parse parameter testNameSpace/testKey to a boolean`);
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
      const parameter = await config.getNumericParameter('testNameSpace', 'testKey');

      // Assert
      expect(parameter).toEqual(Number(secretValue));
    });

    it('should throw an error and log when the parameter cannot be parsed to a number', async () => {
      // Arrange
      const trace = vi.spyOn(config.logger, 'trace');
      const secretValue = 'ten';

      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: secretValue },
      });

      // Act
      const result = config.getNumericParameter('testNameSpace', 'testKey');

      // Assert
      await expect(result).rejects.toThrow(Error);
      expect(trace).toHaveBeenCalledWith(`Could not parse parameter testNameSpace/testKey to a number`);
    });
  });
});
