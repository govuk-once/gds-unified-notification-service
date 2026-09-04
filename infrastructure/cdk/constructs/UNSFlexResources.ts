import { filters } from '@common/utils/array';
import { Dashboard } from 'aws-cdk-lib/aws-cloudwatch';
import { AccountPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSApiGatewayAlarmsConstruct } from 'infrastructure/cdk/constructs/alarmsConstructs/UNSApiGatewayAlarmsConstruct';
import { UNSIntegrationAlarmsConstruct } from 'infrastructure/cdk/constructs/alarmsConstructs/UNSIntegrationAlarmsConstruct';
import { UNSWAFAlarmsConstruct } from 'infrastructure/cdk/constructs/alarmsConstructs/UNSWAFAlarmsConstructs';
import { UNSAPIGatewayGateway } from 'infrastructure/cdk/constructs/bases/UNSApiGatewayConstruct';
import { UNSKMSConstruct } from 'infrastructure/cdk/constructs/bases/UNSKMSConstruct';
import { UNSLambdaConstruct } from 'infrastructure/cdk/constructs/bases/UNSLambdaConstruct';
import { UNSCommon } from 'infrastructure/cdk/constructs/UNSCommon';
import { UNSOrganisationsCommon } from 'infrastructure/cdk/constructs/UNSOrganisations';
import { applyExposureTag } from 'infrastructure/cdk/utils/applyExposureTag';
import { StandardServiceDashboardFactory } from 'once-platform-constructs';

export class UNSFlexResource extends Construct {
  public readonly serviceName = 'flex';
  public readonly publicGateway?: UNSAPIGatewayGateway;
  public readonly gateway: UNSAPIGatewayGateway;

  public readonly alarms: {
    apiGatewayAlarms: UNSApiGatewayAlarmsConstruct;
    wafAlarms: UNSWAFAlarmsConstruct;
    integrationAlarms: UNSIntegrationAlarmsConstruct;
  };
  public readonly lambdas: {
    http: {
      getNotifications: UNSLambdaConstruct;
      getNotificationById: UNSLambdaConstruct;
      patchNotification: UNSLambdaConstruct;
      deleteNotification: UNSLambdaConstruct;
      // Feature flagged
      getGroups?: UNSLambdaConstruct;
      modifyGroups?: UNSLambdaConstruct;
    };
  };

  public readonly dashboards: {
    service: Dashboard;
  };

  constructor(
    scope: Construct,
    config: EnvVars,
    props: {
      refs: UNSCommon;
      orgs: UNSOrganisationsCommon;
    }
  ) {
    super(scope, 'flex');

    const { refs, orgs } = props;

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
          organisations: orgs.organisationsTable.permissions.readOnly,
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
          organisations: orgs.organisationsTable.permissions.readOnly,
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
        sqsSend: [refs.queues.analytics.queue.queueArn],
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

    // GET /v1/groups
    const getGroups =
      config.featureFlag.groups && refs.dynamodb.groupStore
        ? new UNSLambdaConstruct(this, config, {
            ...baseHTTP(`getGroups`),
            environment: {},
            resources: {
              kms: refs.kms,
            },
            iam: {
              ssmNamespaces: [config.namespace],
              sqsSend: [],
              dynamodb: {
                groupstore: refs.dynamodb.groupStore.permissions.readAndWrite,
              },
            },
          })
        : undefined;

    // POST /v1/groups
    const modifyGroups =
      config.featureFlag.groups && refs.dynamodb.groupStore
        ? new UNSLambdaConstruct(this, config, {
            ...baseHTTP(`modifyGroups`),
            environment: {},
            resources: {
              kms: refs.kms,
            },
            iam: {
              ssmNamespaces: [config.namespace],
              sqsSend: [],
              dynamodb: {
                groupstore: refs.dynamodb.groupStore.permissions.readAndWrite,
              },
            },
          })
        : undefined;

    this.lambdas = {
      http: {
        getNotifications,
        getNotificationById,
        patchNotification,
        deleteNotification,
        getGroups,
        modifyGroups,
      },
    };
    for (const value of Object.values(this.lambdas.http)) {
      if (value) {
        applyExposureTag(value, 'Internal');
      }
    }

    //// =====================================================
    // API Gateway
    //// =====================================================

    if (config.debuggableFlexApiGateway) {
      // This API Gateway is only available in dev & sandbox environments
      this.publicGateway = new UNSAPIGatewayGateway(this, config, {
        name: [`flex`],
        description: `API Gateway for flex (Dev testing only)`,
        domain: 'flex',
        resources: {
          kms: refs.kms,
        },
        type: 'PUBLIC',
        usagePlanDefaults: {
          quota: {
            limit: 100000,
          },
          throttle: {
            rateLimit: 100,
            burstLimit: 200,
          },
        },
        usagePlans: {
          e2e: {},
        },
      });
      applyExposureTag(this.publicGateway, 'Perimeter');
      applyExposureTag(this.publicGateway.waf, 'Perimeter');
    }

    this.gateway = new UNSAPIGatewayGateway(this, config, {
      name: [`flex-private`],
      description: `API Gateway for flex (Private)`,
      resources: {
        kms: refs.kms,
      },
      type: `PRIVATE`,
      iam:
        config.ssm.flex.account !== null && config.ssm.flex.vpce && config.ssm.flex.vpce.length > 0
          ? {
              allowOnlyFromKnownSources: {
                awsAccountID: config.ssm.flex.account,
                vpceIDs: config.ssm.flex.vpce,
                vpceEndpoints: [refs.vpc.interfaceEndpoints.Apigateway],
              },
            }
          : {},
      usagePlanDefaults: {
        quota: {
          limit: 100000,
        },
        throttle: {
          rateLimit: 100,
          burstLimit: 200,
        },
      },
      usagePlans: {
        flex: {},
      },
    });
    applyExposureTag(this.gateway, 'Isolated');
    applyExposureTag(this.gateway.waf, 'Internal');

    for (const gateway of [this.publicGateway, this.gateway].filter(filters.isDefined)) {
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
      if (this.lambdas.http.getGroups) {
        gateway.GET(`getGroups`, `/v1/groups`, this.lambdas.http.getGroups.integration);
      }
      if (this.lambdas.http.modifyGroups) {
        gateway.POST(`modify`, `/v1/groups`, this.lambdas.http.modifyGroups.integration);
      }
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
        lambdas: Object.values(this.lambdas.http)
          .filter(filters.isDefined)
          .map((x) => x.fn),
        name: config.utils.namingHelper(`flex-service`),
        restApis: [this.gateway.restApi, this.publicGateway?.restApi].filter(filters.isDefined),
        tables: [refs.dynamodb.campaigns.table, refs.dynamodb.messages.table],
      }),
    };

    //// =====================================================
    // Consumer configuration
    //// =====================================================

    const flexConsumerKMS = new UNSKMSConstruct(this, config, {
      name: ['kms', 'flex', 'consumer'],
      policies: {
        root: true,
        lambdas: true,
        cloudwatch: true,
      },
    });
    const flexConsumerSecret = new Secret(this, config.utils.namingHelper('flex', 'consumer-secret'), {
      secretName: `${config.prefix}/flex/consumer`,
      description: 'Consumer secret for the UNS Service gateway within Flex',
      encryptionKey: flexConsumerKMS.key,
    });
    if (config.ssm.flex.account !== null) {
      flexConsumerKMS.key.addToResourcePolicy(
        new PolicyStatement({
          sid: 'AllowExternalAccountToDecrypt',
          effect: Effect.ALLOW,
          principals: [new AccountPrincipal(config.ssm.flex.account)],
          actions: ['kms:Decrypt', 'kms:DescribeKey'],
          resources: ['*'],
        })
      );
      flexConsumerSecret.addToResourcePolicy(
        new PolicyStatement({
          sid: 'AllowExternalAccountToReadSecret',
          effect: Effect.ALLOW,
          principals: [new AccountPrincipal(config.ssm.flex.account)],
          actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
          resources: ['*'],
        })
      );
    }

    //// =====================================================
    // CloudWatch Alarms
    //// =====================================================

    this.alarms = {
      apiGatewayAlarms: new UNSApiGatewayAlarmsConstruct(this, config, {
        restApi: this.gateway.restApi,
        alertTopic: refs.alertTopic,
        group: this.serviceName,
      }),
      wafAlarms: new UNSWAFAlarmsConstruct(this, config, {
        waf: this.gateway.waf,
        alertTopic: refs.alertTopic,
        group: this.serviceName,
      }),
      integrationAlarms: new UNSIntegrationAlarmsConstruct(this, config, {
        alertTopic: refs.alertTopic,
        group: this.serviceName,
        lambdas: Object.entries(this.lambdas.http)
          .filter(([, fn]) => fn !== undefined)
          .map(([name, func]) => ({ name, func: func.fn })),
      }),
    };
  }
}
