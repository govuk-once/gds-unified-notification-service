import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { Configuration } from "@common/services/configuration";
import { mockClient } from "aws-sdk-client-mock";

const ssmMock = mockClient(SSMClient);
const config = new Configuration();

describe('Configuration', () => {
  beforeEach(() => {
    ssmMock.reset();
  });

  it("should secret from parameter store with namespace and value", async () => {
    // arrange
    const secretValue = "secret"
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: { Value: secretValue},
    });

    // act
    const parameter = await config.getParameter("testNameSpace", "testValue");

    // assert
    expect(parameter).toEqual(secretValue)
  });

  it("should log an error when the call fails", async () => {
    // Arrange
    vi.spyOn(config.logger, "trace");
    const error = new Error("AWS Error")
    ssmMock.on(GetParameterCommand).rejects(error);

    // Act
    const result = await config.getParameter("testNameSpace", "testValue");

    // Assert
    expect(result).toBeUndefined();
    expect(config.logger.trace).toHaveBeenCalledWith(`Error: ${error}`);
  });
})
