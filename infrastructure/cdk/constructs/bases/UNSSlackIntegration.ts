import { SlackChannelConfiguration } from 'aws-cdk-lib/aws-chatbot';
import { ManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';

interface AlertProps {
  name: string[];
  topics: Topic[];
  kms: IKey;
  workspaceId: string;
  channelId: string;
}

export class UNSSlackAlert extends Construct {
  constructor(scope: Construct, config: EnvVars, props: AlertProps) {
    const { namingHelper, constructNamingHelper } = config.utils;
    super(scope, constructNamingHelper(...props.name));

    const slack = new SlackChannelConfiguration(scope, constructNamingHelper(`slack`, ...props.name), {
      slackChannelConfigurationName: namingHelper(`slack`, ...props.name),
      slackWorkspaceId: props.workspaceId,
      slackChannelId: props.channelId,
      notificationTopics: props.topics,
      guardrailPolicies: [ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess')],
    });

    if (!slack.role) {
      throw new Error('SlackChannelConfiguration has no role; cannot grant KMS decrypt');
    }

    slack.role.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
        resources: [props.kms.keyArn],
      })
    );
  }
}
