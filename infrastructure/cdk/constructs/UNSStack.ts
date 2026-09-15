import { CfnOutput, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSCommon } from 'infrastructure/cdk/constructs/UNSCommon';
import { UNSFlexResource } from 'infrastructure/cdk/constructs/UNSFlexResources';
import { UNSMTLSCommon } from 'infrastructure/cdk/constructs/UNSMTLS';
import { UNSOrganisationsCommon } from 'infrastructure/cdk/constructs/UNSOrganisations';
import { UNSPSOResource } from 'infrastructure/cdk/constructs/UNSPSOResources';
import { UNSResourceContract } from 'infrastructure/cdk/constructs/UNSResourceContract';
import { applyCheckovSkipsS3Bucket, findResource } from 'infrastructure/cdk/utils/applyCheckovSkip';

export class UNSStack extends Stack {
  public readonly common: UNSCommon;
  public readonly pso: UNSPSOResource;
  public readonly flex: UNSFlexResource;

  constructor(
    protected scope: Construct,
    protected id: string,
    protected props: StackProps,
    protected config: EnvVars
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
        ...(config.isMainEnv
          ? {
              revocationTableArn: mtls.revocationTable!.table.tableArn,
              revocationTableAttributes: mtls.revocationTable!.attributes,
            }
          : {
              revocationTableArn: config.sandbox.shared.revocationTable!,
              revocationTableAttributes: config.sandbox.shared.revocationAttributes,
            }),
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
          dispatch: this.pso.queues.dispatch.queue.queueName,
          analytics: this.pso.queues.analytics.queue.queueName,
        },
        lambdaFunctionNames: {
          mtlsCertificateRevocationAuthorizer:
            this.pso.lambdas.authorizers.mtlsCertificateRevocationAuthorizer.fn.functionName,
          getHealthcheck: this.pso.lambdas.http.getHealthcheck.fn.functionName,
          getNotificationStatus: this.pso.lambdas.http.getNotificationStatus.fn.functionName,
          getCampaignStatus: this.pso.lambdas.http.getCampaignStatus.fn.functionName,
          postMessage: this.pso.lambdas.http.postMessage.fn.functionName,
          postGroupMessage: this.pso.lambdas.http.postGroupMessage?.fn.functionName,
          validation: this.pso.lambdas.sqs.validation.fn.functionName,
          processing: this.pso.lambdas.sqs.processing.fn.functionName,
          groupProcessingWorker: this.pso.lambdas.sqs.groupProcessingWorker?.fn.functionName,
          dispatch: this.pso.lambdas.sqs.dispatch.fn.functionName,
          analytics: this.pso.lambdas.sqs.analytics.fn.functionName,
          analyticsExport: this.pso.lambdas.schedule.analyticsExport.fn.functionName,
        },
      },
      flex: {
        restApiName: this.flex.gateway.restApi.restApiName,
        wafName: this.flex.gateway.waf.name!,
        lambdaFunctionNames: {
          getNotifications: this.flex.lambdas.http.getNotifications.fn.functionName,
          getNotificationById: this.flex.lambdas.http.getNotificationById.fn.functionName,
          patchNotification: this.flex.lambdas.http.patchNotification.fn.functionName,
          deleteNotification: this.flex.lambdas.http.deleteNotification.fn.functionName,
          getGroups: this.flex.lambdas.http.getGroups?.fn.functionName,
          modifyGroups: this.flex.lambdas.http.modifyGroups?.fn.functionName,
        },
      },
    };
  }

  public applyTags(scope: Construct, config: EnvVars) {
    // Certain resource types do not consistently respond when updated regularly with new tags
    // (i.e. code version)
    const problematicResourceTypes = [
      `AWS::ElastiCache::User`,
      `AWS::ElastiCache::UserGroup`,
      `AWS::ElastiCache::ServerlessCache`,
    ];
    // Apply all tags to all rescources - except the problematic ones
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
