import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { IRequestEvent } from '@common/middlewares';
import { MTLSRevocation } from '@common/repositories';
import { MetricsLabels } from '@common/services';
import { MtlsCertificateRevocationAuthorizer } from '@project/lambdas/pso/http.mtlsCertificateRevocationAuthorizer/handler';
import {
  iocSpies,
  mockAllowPolicy,
  mockDenyPolicy,
  mockEventContext,
  mockEventWithCertificate,
  mockServicesExpectedBehaviour,
} from '@test/mocks';
import { Context } from 'aws-lambda';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });

vi.mock('@common/services', { spy: true });
vi.mock('@common/repositories', { spy: true });

describe('MTLSApiGatewayAuthorizer Handler', () => {
  let instance: MtlsCertificateRevocationAuthorizer;

  // Initialize mock services, clients, and repositories
  const { observabilityMocks, serviceMocks } = iocSpies();

  const { mtlsRevocationDynamoRepositoryMock, organisationsDynamoRepositoryMock } = serviceMocks;

  // Test Fixtures
  let context: Context;
  const mockOrganisationID = 'ORG01';
  const expectedAllowPolicy = mockAllowPolicy();
  const expectedDenyPolicy = mockDenyPolicy();

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Test Fixtures
    context = mockEventContext('mtlsApiGatewayAuthorizer');

    // Mock SSM store and services responses
    mockServicesExpectedBehaviour(serviceMocks);

    instance = new MtlsCertificateRevocationAuthorizer(observabilityMocks, () => ({
      mtlsRevocationDynamoRepository: mtlsRevocationDynamoRepositoryMock.initialize(),
      organisationsDynamoRepository: organisationsDynamoRepositoryMock.initialize(),
    }));
  });

  it('should reject requests without clientCertPem', async () => {
    // Arrange
    const event = {} as unknown as IRequestEvent;

    // Act
    const result = await instance.handler()(event, context);

    // Assert
    expect(result).toEqual(expectedDenyPolicy);
    expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
      MetricsLabels.MTLS_AUTH_REQUESTS_COUNT,
      MetricUnit.Count,
      1
    );
    expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
      MetricsLabels.MTLS_AUTH_REQUESTS_DENIED_COUNT,
      MetricUnit.Count,
      1
    );
  });

  it('should generate sha256 based on the sample cert', async () => {
    // Arrange
    mtlsRevocationDynamoRepositoryMock.getRecord.mockResolvedValue({ Revoked: true } as unknown as MTLSRevocation);
    const event = mockEventWithCertificate() as unknown as IRequestEvent;

    // Act
    const result = await instance.handler()(event, context);

    // Assert
    expect(result).toEqual(expectedDenyPolicy);
    expect(mtlsRevocationDynamoRepositoryMock.getRecord).toHaveBeenCalledWith(
      `5ca769c8c69d1cbccc2cad3aeff62224d8d30fffe50a59e625253e675813843c`
    );
  });

  it('should deny request if certificate does not exists', async () => {
    // Arrange
    mtlsRevocationDynamoRepositoryMock.getRecord.mockResolvedValue(null);
    const event = mockEventWithCertificate() as unknown as IRequestEvent;

    // Act
    const result = await instance.handler()(event, context);

    // Assert
    expect(result).toEqual(expectedDenyPolicy);
    expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
      MetricsLabels.MTLS_AUTH_REQUESTS_COUNT,
      MetricUnit.Count,
      1
    );
    expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
      MetricsLabels.MTLS_AUTH_REQUESTS_DENIED_UNKNOWN_CERTIFICATE_COUNT,
      MetricUnit.Count,
      1
    );
  });

  it('should deny request certificate has been revoked', async () => {
    // Arrange
    mtlsRevocationDynamoRepositoryMock.getRecord.mockResolvedValue({ Revoked: true } as unknown as MTLSRevocation);
    const event = mockEventWithCertificate() as unknown as IRequestEvent;

    // Act
    const result = await instance.handler()(event, context);

    // Assert
    expect(result).toEqual(expectedDenyPolicy);
    expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
      MetricsLabels.MTLS_AUTH_REQUESTS_COUNT,
      MetricUnit.Count,
      1
    );
    expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
      MetricsLabels.MTLS_AUTH_REQUESTS_DENIED_REVOKED_CERTIFICATE_COUNT,
      MetricUnit.Count,
      1
    );
  });

  it('should deny request if organization is missing from certificate', async () => {
    // Arrange
    mtlsRevocationDynamoRepositoryMock.getRecord.mockResolvedValue({
      Organization: undefined,
      Revoked: false,
    } as unknown as MTLSRevocation);
    const event = mockEventWithCertificate() as unknown as IRequestEvent;

    // Act
    const result = await instance.handler()(event, context);

    // Assert
    expect(result).toEqual(expectedDenyPolicy);
    expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
      MetricsLabels.MTLS_AUTH_REQUESTS_COUNT,
      MetricUnit.Count,
      1
    );
    expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
      MetricsLabels.MTLS_AUTH_REQUESTS_DENIED_NO_ORGANIZATION_COUNT,
      MetricUnit.Count,
      1
    );
  });

  it('should allow request with existing certificate that has not been revoked', async () => {
    // Arrange
    mtlsRevocationDynamoRepositoryMock.getRecord.mockResolvedValueOnce({
      Organization: mockOrganisationID,
      Revoked: false,
    } as unknown as MTLSRevocation);
    organisationsDynamoRepositoryMock.getRecord.mockResolvedValueOnce({
      DisplayName: 'TestOrganisation',
      OrganisationID: mockOrganisationID,
      OrganisationConfig: {
        MessageRetention: {
          Allowed: false,
        },
      },
    });
    const event = mockEventWithCertificate() as unknown as IRequestEvent;

    // Act
    const result = await instance.handler()(event, context);

    // Assert
    expect(result).toEqual(expectedAllowPolicy);
    expect(observabilityMocks.metrics.addMetric).toHaveBeenCalledWith(
      MetricsLabels.MTLS_AUTH_REQUESTS_ALLOWED_COUNT,
      MetricUnit.Count,
      1
    );
  });

  it('should inject organisation config into headers after request has been allowed', async () => {
    // Arrange
    mtlsRevocationDynamoRepositoryMock.getRecord.mockResolvedValueOnce({
      Organization: mockOrganisationID,
      Revoked: false,
    } as unknown as MTLSRevocation);
    organisationsDynamoRepositoryMock.getRecord.mockResolvedValueOnce({
      DisplayName: 'TestOrganisation',
      OrganisationID: mockOrganisationID,
      OrganisationConfig: {
        MessageRetention: {
          Allowed: false,
        },
      },
    });
    const expectAllowPolicyWithHeaders = expect.objectContaining({
      context: expect.objectContaining({
        Organization: mockOrganisationID,
      }),
    });
    const event = mockEventWithCertificate() as unknown as IRequestEvent;

    // Act
    const result = await instance.handler()(event, context);

    // Assert
    expect(result).toEqual(expectAllowPolicyWithHeaders);
  });

  it('should return a service misconfigured error if there is no organisation record for the orgID provided', async () => {
    // Arrange
    mtlsRevocationDynamoRepositoryMock.getRecord.mockResolvedValueOnce({
      Organization: mockOrganisationID,
      Revoked: false,
    } as unknown as MTLSRevocation);
    organisationsDynamoRepositoryMock.getRecord.mockResolvedValueOnce(null);
    const event = mockEventWithCertificate() as unknown as IRequestEvent;

    // Act
    const result = await instance.handler()(event, context);

    // Assert
    expect(JSON.parse(result.body)).toEqual({
      Status: 500,
      HttpError: 'InternalServerError',
      Errors: ['There is no organisation record for this organisation'],
    });
  });
});
