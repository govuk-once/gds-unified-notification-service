import { Dashboard } from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSAPIGatewayGateway } from 'infrastructure/cdk/constructs/bases/UNSApiGatewayConstruct';
import { UNSLambdaConstruct } from 'infrastructure/cdk/constructs/bases/UNSLambdaConstruct';
import { UNSCommon } from 'infrastructure/cdk/constructs/UNSCommon';
import { StandardServiceDashboardFactory } from 'once-platform-constructs';

export class UNSFlexResource extends Construct {
  public readonly serviceName = 'pso';
  public readonly publicGateway?: UNSAPIGatewayGateway;
  public readonly gateway: UNSAPIGatewayGateway;
  public readonly lambdas: {
    http: {
      getNotifications: UNSLambdaConstruct;
      getNotificationById: UNSLambdaConstruct;
      patchNotification: UNSLambdaConstruct;
      deleteNotification: UNSLambdaConstruct;
    };
  };
  public readonly dashboards: {
    service: Dashboard;
  };
  constructor(scope: Construct, config: EnvVars, refs: UNSCommon) {
    super(scope, 'flex');

    //// =====================================================
    // Lambdas
    //// =====================================================

    // Helper definitions
    const serviceName = 'flex';
    const baseHTTP = UNSLambdaConstruct.baseHTTPFactory(serviceName, refs.codeSigning);

    // /notifications
    const getNotifications = new UNSLambdaConstruct(this, config, {
      ...baseHTTP(`getNotifications`),
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [config.namespace],
        dynamodb: {
          messages: refs.dynamodb.messages.permissions.readOnly,
        },
      },
    });

    // GET /notifications/{notificationID}
    const getNotificationById = new UNSLambdaConstruct(this, config, {
      ...baseHTTP(`getNotificationById`),
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [config.namespace],
        dynamodb: {
          messages: refs.dynamodb.messages.permissions.readOnlyById,
        },
      },
    });

    // PATCH /notifications/{notificationID}/status
    const patchNotification = new UNSLambdaConstruct(this, config, {
      ...baseHTTP(`patchNotification`),
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [config.namespace],
        dynamodb: {
          messages: refs.dynamodb.messages.permissions.readOnlyById,
        },
      },
    });

    // DELETE /notifications/{notificationID}
    const deleteNotification = new UNSLambdaConstruct(this, config, {
      ...baseHTTP(`deleteNotification`),
      environment: {},
      resources: {
        kms: refs.kms,
      },
      iam: {
        ssmNamespaces: [config.namespace],
        sqsSend: [refs.queues.analytics.queue.queueArn],
        dynamodb: {
          messages: refs.dynamodb.messages.permissions.readOnlyById,
        },
      },
    });

    this.lambdas = {
      http: {
        getNotifications,
        getNotificationById,
        patchNotification,
        deleteNotification,
      },
    };

    //// =====================================================
    // API Gateway
    //// =====================================================

    if (config.debuggableFlexApiGateway) {
      this.publicGateway = new UNSAPIGatewayGateway(this, config, {
        name: [`flex`],
        description: `API Gateway for flex (Public - to be depracated soon)`,
        domain: 'flex',
        resources: {
          kms: refs.kms,
        },
        type: 'PUBLIC',
      });
    }

    this.gateway = new UNSAPIGatewayGateway(this, config, {
      name: [`flex-private`],
      description: `API Gateway for flex (Private)`,
      resources: {
        kms: refs.kms,
      },
      type: `PRIVATE`,
      iam:
        config.ssm.flex.account !== null && config.ssm.flex.vpce.length > 0
          ? {
              allowOnlyFromKnownSources: {
                awsAccountID: config.ssm.flex.account,
                vpceIDs: config.ssm.flex.vpce,
                vpceEndpoints: [refs.vpc.interfaceEndpoints.Apigateway],
              },
            }
          : {},
    });

    for (const gateway of [this.publicGateway, this.gateway].filter((gateway) => gateway !== undefined)) {
      gateway
        .GET('getNotifications', '/notifications', this.lambdas.http.getNotifications.integration)
        .GET(
          'getNotificationById',
          '/notifications/{notificationID}',
          this.lambdas.http.getNotificationById.integration
        )
        .PATCH(
          'patchNotification',
          '/notifications/{notificationID}/status',
          this.lambdas.http.patchNotification.integration
        )
        .DELETE(
          'deleteNotification',
          '/notifications/{notificationID}',
          this.lambdas.http.deleteNotification.integration
        );
    }

    //// =====================================================
    // Xray Dashboards
    //// =====================================================
    this.dashboards = {
      service: new StandardServiceDashboardFactory(
        this,
        `flex`,
        undefined,
        undefined,
        config.utils.namingProvider()
      ).createDashboard(`flex-service`, {
        lambdas: [...Object.values(this.lambdas.http)].map((x) => x.fn),
        name: config.utils.namingHelper(`flex-service`),
        restApis: [this.gateway.restApi, this.publicGateway?.restApi].filter((api) => api !== undefined),
        tables: [refs.dynamodb.campaigns.table, refs.dynamodb.messages.table],
      }),
    };
  }
}
