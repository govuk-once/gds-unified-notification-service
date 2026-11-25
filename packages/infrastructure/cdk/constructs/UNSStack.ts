import { EnvVars } from '@infra/cdk/config';
import { UNSCommon } from '@infra/cdk/constructs/UNSCommon';
import { UNSFlexResource } from '@infra/cdk/constructs/UNSFlexResources';
import { UNSGlobalStack } from '@infra/cdk/constructs/UNSGlobalStack';
import { UNSMTLSCommon } from '@infra/cdk/constructs/UNSMTLS';
import { UNSOrganisationsCommon } from '@infra/cdk/constructs/UNSOrganisations';
import { UNSPSOResource } from '@infra/cdk/constructs/UNSPSOResources';
import { UNSResourceContract } from '@infra/cdk/constructs/UNSResourceContract';
import { applyCheckovSkipsS3Bucket, findResource } from '@infra/cdk/utils/applyCheckovSkip';
import { CfnOutput, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class UNSStack extends Stack {
  public readonly common: UNSCommon;
  public readonly pso: UNSPSOResource;
  public readonly flex: UNSFlexResource;

  constructor(
    protected scope: Construct,
    protected id: string,
    protected props: StackProps,
    protected config: EnvVars,
    protected globalStack: UNSGlobalStack,
    protected buildNumber?: string
  ) {
    super(scope, id, props);

    this.common = new UNSCommon(this, config);
    const common = this.common;
    const mtls = new UNSMTLSCommon(this, config, common);
    const organisations = new UNSOrganisationsCommon(this, config, common);
    this.pso = new UNSPSOResource(this, config, {
      refs: common,
      orgs: organisations,
      mtls: {
        truststorePath: mtls.truststorePath,
        dependencies: [mtls.truststoreUpload],
        // Main environments generate their own CA cert, dev environments pull it via exported values
        ...(config.isPersistentEnv
          ? {
              revocationTableArn: mtls.revocationTable!.table.tableArn,
              revocationTableAttributes: mtls.revocationTable!.attributes,
            }
          : {
              revocationTableArn: config.sandbox.shared.revocationTable!,
              revocationTableAttributes: config.sandbox.shared.revocationAttributes,
            }),
      },
      waf: {
        cloudfrontWebAclArn: globalStack.cloudfrontWebAclArn,
      },
    });
    this.flex = new UNSFlexResource(this, config, { refs: common, orgs: organisations });

    this.applyTags(this, config);
    this.applyCheckovSkips();
  }

  resourceNames(): UNSResourceContract {
    return {
      alertTopicArn: this.common.alertTopic.topicArn,
      pso: {
        restApiName: this.pso.gateway.restApi.restApiName,
        wafName: this.pso.gateway.waf.name!,
        queueNames: {
          incoming: this.pso.queues.incoming.queue.queueName,
          processing: this.pso.queues.processing.queue.queueName,
          groupProcessing: this.pso.queues.groupProcessing?.queue.queueName,
          dispatch: this.pso.queues.dispatch.queue.queueName,
          analytics: this.pso.queues.analytics.queue.queueName,
        },
        dlqNames: {
          incomingDlq: this.pso.queues.incoming.dlq?.queueName,
          processingDlq: this.pso.queues.processing.dlq?.queueName,
          groupProcessingDlq: this.pso.queues.groupProcessing?.dlq?.queueName,
          dispatchDlq: this.pso.queues.dispatch.dlq?.queueName,
        },
        logGroupNames: {
          postMessage: this.pso.lambdas.http.postMessage.logGroup.logGroupName,
          processing: this.pso.lambdas.sqs.processing.logGroup.logGroupName,
          dispatch: this.pso.lambdas.sqs.dispatch.logGroup.logGroupName,
          postGroupMessage: this.pso.lambdas.http.postGroupMessage?.logGroup.logGroupName,
          groupProcessingWorker: this.pso.lambdas.sqs.groupProcessingWorker?.logGroup.logGroupName,
        },
        lambdaFunctionNames: {
          mtlsCertificateRevocationAuthorizer:
            this.pso.lambdas.authorizers.mtlsCertificateRevocationAuthorizer.lambdaRef(),
          getHealthcheck: this.pso.lambdas.http.getHealthcheck.lambdaRef(),
          getNotificationStatus: this.pso.lambdas.http.getNotificationStatus.lambdaRef(),
          getCampaignStatus: this.pso.lambdas.http.getCampaignStatus.lambdaRef(),
          postMessage: this.pso.lambdas.http.postMessage.lambdaRef(),
          postGroupMessage: this.pso.lambdas.http.postGroupMessage?.lambdaRef(),
          validation: this.pso.lambdas.sqs.validation.lambdaRef(),
          processing: this.pso.lambdas.sqs.processing.lambdaRef(),
          groupProcessingWorker: this.pso.lambdas.sqs.groupProcessingWorker?.lambdaRef(),
          dispatch: this.pso.lambdas.sqs.dispatch.lambdaRef(),
          analytics: this.pso.lambdas.sqs.analytics.lambdaRef(),
          analyticsExport: this.pso.lambdas.schedule.analyticsExport.lambdaRef(),
        },
      },
      flex: {
        restApiName: this.flex.gateway.restApi.restApiName,
        wafName: this.flex.gateway.waf.name!,
        lambdaFunctionNames: {
          getNotifications: this.flex.lambdas.http.getNotifications.lambdaRef(),
          getNotificationById: this.flex.lambdas.http.getNotificationById.lambdaRef(),
          patchNotification: this.flex.lambdas.http.patchNotification.lambdaRef(),
          deleteNotification: this.flex.lambdas.http.deleteNotification.lambdaRef(),
          getGroups: this.flex.lambdas.http.getGroups?.lambdaRef(),
          modifyGroups: this.flex.lambdas.http.modifyGroups?.lambdaRef(),
        },
      },
    };
  }

  public applyTags(scope: Construct, config: EnvVars) {
    // Certain resource types do not consistently respond when updated regularly with new tags
    const problematicResourceTypes = [
      `AWS::ElastiCache::User`,
      `AWS::ElastiCache::UserGroup`,
      `AWS::ElastiCache::ServerlessCache`,
    ];

    // Apply all tags to all resources - except the problematic ones
    for (const [key, value] of Object.entries({
      ...config.defaultTags(),
    })) {
      Tags.of(scope).add(key, value, { excludeResourceTypes: problematicResourceTypes });
    }

    // Also add metadata as outputs to the cloudformation stack itself for improved traceability
    const metadata = new Construct(this, `metadata`);
    for (const [key, value] of Object.entries({ ...config.defaultTags() })) {
      new CfnOutput(metadata, key, {
        description: `Build metadata - ${key}`,
        value: value,
      });
    }
  }

  public applyCheckovSkips() {
    const autoDeleteLambda = findResource(this, (c) =>
      c.node.id.includes(`Custom::S3AutoDeleteObjectsCustomResourceProvider`)
    );
    if (autoDeleteLambda) {
      applyCheckovSkipsS3Bucket(autoDeleteLambda);
    }
  }
}
