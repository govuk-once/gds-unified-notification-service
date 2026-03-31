/* eslint-disable @typescript-eslint/unbound-method */
import { IRequestEvent } from '@common/middlewares';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { observabilitySpies, ServiceSpies } from '@common/utils/mockInstanceFactory.test.util';
import { MTLSRevocation } from '@project/lambdas/interfaces/MTLSRevocationTable';
import { MtlsCertificateRevocationAuthorizer } from '@project/lambdas/pso/http.mtlsCertificateRevocationAuthorizer/handler';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/repositories', { spy: true });
vi.mock('@common/services', { spy: true });

describe('MTLSApiGatewayAuthorizer Handler', () => {
  let instance: MtlsCertificateRevocationAuthorizer;
  let mockContext: Context;
  let mockEmptyEvent: IRequestEvent;
  let mockEventWithCertificate: IRequestEvent;

  const observabilityMocks = observabilitySpies();
  const serviceMocks = ServiceSpies(observabilityMocks);
  const { mtlsRevocationDynamoRepositoryMock, configurationServiceMock } = serviceMocks;

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const expectedAllowPolicy = expect.objectContaining({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    policyDocument: expect.objectContaining({
      Statement: [
        expect.objectContaining({
          Effect: 'Allow',
        }),
      ],
    }),
  });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const expectedDenyPolicy = expect.objectContaining({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    policyDocument: expect.objectContaining({
      Statement: [
        expect.objectContaining({
          Effect: 'Deny',
        }),
      ],
    }),
  });
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    configurationServiceMock.getParameter.mockImplementation(mockGetParameterImplementation(mockParameterStore));

    instance = new MtlsCertificateRevocationAuthorizer(observabilityMocks, () => ({
      mtlsRevocationDynamoRepository: mtlsRevocationDynamoRepositoryMock.initialize(),
    }));

    // Mock AWS Lambda Context
    mockContext = {
      functionName: 'mtlsApiGatewayAuthorizer',
    } as unknown as Context;

    // Mock event
    mockEmptyEvent = {} as unknown as typeof mockEmptyEvent;
    mockEventWithCertificate = {
      requestContext: {
        identity: {
          clientCert: {
            clientCertPem: `MOCK_CERTIFICATE_CONTENT`,
          },
        },
      },
    } as unknown as typeof mockEventWithCertificate;
  });

  it('should reject requests without clientCertPem', async () => {
    // Act
    const result = await instance.handler()(mockEmptyEvent, mockContext);

    // Assert
    expect(result).toEqual(expectedDenyPolicy);
    expect(observabilityMocks.metrics.addMetric).toBeCalledWith('MTLS_AUTH_REQUESTS_COUNT', `Count`, 1);
    expect(observabilityMocks.metrics.addMetric).toBeCalledWith('MTLS_AUTH_REQUESTS_DENIED_COUNT', `Count`, 1);
  });

  it('should generate sha256 based on the sample cert', async () => {
    // Arrange
    mtlsRevocationDynamoRepositoryMock.getRecord.mockResolvedValue({ Revoked: true } as unknown as MTLSRevocation);

    // Act
    const result = await instance.handler()(mockEventWithCertificate, mockContext);

    // Assert
    expect(result).toEqual(expectedDenyPolicy);
    expect(mtlsRevocationDynamoRepositoryMock.getRecord).toHaveBeenCalledWith(
      `5ca769c8c69d1cbccc2cad3aeff62224d8d30fffe50a59e625253e675813843c`
    );
  });

  it('should deny request if certificate does not exists', async () => {
    // Arrange
    mtlsRevocationDynamoRepositoryMock.getRecord.mockResolvedValue(null);

    // Act
    const result = await instance.handler()(mockEventWithCertificate, mockContext);

    // Assert
    expect(result).toEqual(expectedDenyPolicy);
    expect(observabilityMocks.metrics.addMetric).toBeCalledWith('MTLS_AUTH_REQUESTS_COUNT', `Count`, 1);
    expect(observabilityMocks.metrics.addMetric).toBeCalledWith(
      'MTLS_AUTH_REQUESTS_DENIED_UNKNOWN_CERTIFICATE_COUNT',
      `Count`,
      1
    );
  });

  it('should deny request certificate has been revoked', async () => {
    // Arrange
    mtlsRevocationDynamoRepositoryMock.getRecord.mockResolvedValue({ Revoked: true } as unknown as MTLSRevocation);

    // Act
    const result = await instance.handler()(mockEventWithCertificate, mockContext);

    // Assert
    expect(result).toEqual(expectedDenyPolicy);
    expect(observabilityMocks.metrics.addMetric).toBeCalledWith('MTLS_AUTH_REQUESTS_COUNT', `Count`, 1);
    expect(observabilityMocks.metrics.addMetric).toBeCalledWith(
      'MTLS_AUTH_REQUESTS_DENIED_REVOKED_CERTIFICATE_COUNT',
      `Count`,
      1
    );
  });

  it('should allow request with existing certificate that has not been revoked', async () => {
    // Arrange
    mtlsRevocationDynamoRepositoryMock.getRecord.mockResolvedValue({ Revoked: false } as unknown as MTLSRevocation);

    // Act
    const result = await instance.handler()(mockEventWithCertificate, mockContext);

    // Assert
    expect(result).toEqual(expectedAllowPolicy);
    expect(observabilityMocks.metrics.addMetric).toBeCalledWith('MTLS_AUTH_REQUESTS_ALLOWED_COUNT', `Count`, 1);
  });
});
