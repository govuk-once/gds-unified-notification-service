import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSAPIGatewayGateway } from 'infrastructure/cdk/constructs/bases/UNSApiGatewayConstruct';
import { UNSLambdaConstruct } from 'infrastructure/cdk/constructs/bases/UNSLambdaConstruct';
import { UNSCommon } from 'infrastructure/cdk/constructs/UNSCommon';

export class UNSFlexResource extends Construct {
  public readonly serviceName = 'pso';
  public readonly publicGateway: UNSAPIGatewayGateway;
  public readonly gateway: UNSAPIGatewayGateway;
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

    const lambdas = {
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

    this.publicGateway = new UNSAPIGatewayGateway(this, config, {
      name: [`flex`],
      description: `API Gateway for flex (Public - to be depracated soon)`,
      domain: config.env !== 'stg' ? 'flex' : 'flex-cdk',
      resources: {
        kms: refs.kms,
      },
      type: 'PUBLIC',
    });

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
              },
            }
          : {},
    });

    for (const gateway of [this.publicGateway, this.gateway]) {
      gateway
        .GET('getNotifications', '/notifications', lambdas.http.getNotifications.integration)
        .GET('getNotificationById', '/notifications/{notificationID}', lambdas.http.getNotificationById.integration)
        .PATCH(
          'patchNotification',
          '/notifications/{notificationID}/status',
          lambdas.http.patchNotification.integration
        )
        .DELETE('deleteNotification', '/notifications/{notificationID}', lambdas.http.deleteNotification.integration);
    }
  }
}
