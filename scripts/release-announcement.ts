import { ListTopicsCommand, PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { config } from './../infrastructure/cdk/config';
async function sendReleaseNotification() {
  const { version, env } = config;
  const serverUrl = process.env.SERVER_URL || '';
  const repository = process.env.REPOSITORY || '';
  const runUrl = process.env.RUN_URL || '';

  const snsClient = new SNSClient({});

  // Fetch CloudFormation output value
  const topicArn = (await snsClient.send(new ListTopicsCommand({}))).Topics?.find((topic) =>
    topic.TopicArn?.endsWith(config.utils.namingHelper('sns', 'topic', 'releases'))
  )?.TopicArn;

  if (topicArn == undefined) {
    console.log(`Failed to retrieve release SNS Topic (may be on sandbox or ephemeral environment)`);
    return 0;
  }

  // Parse semver from VERSION ("<semver>@<sha>")
  const [semver] = version.split('@');
  let linkUrl = runUrl;
  let linkText = 'Workflow run';

  if (semver && semver !== '0.0.0') {
    linkUrl = `${serverUrl}/${repository}/releases/tag/v${semver}`;
    linkText = `Release notes for v${semver}`;
  }

  // Publish notification to AWS SNS
  await snsClient.send(
    new PublishCommand({
      TopicArn: topicArn,

      Message: JSON.stringify({
        version: '1.0',
        source: 'custom',
        content: {
          textType: 'client-markdown',
          title: `:rocket: UNS deployed to ${env}`,
          description: `*Version:* \`${version}\`\n*Environment:* \`${env}\`\n<${linkUrl}|${linkText}>`,
        },
        metadata: {
          summary: `UNS ${version} deployed to ${env}`,
          eventType: 'deployment.succeeded',
          additionalContext: {
            version,
            environment: env,
            release: linkUrl,
            workflowRun: runUrl,
          },
        },
      }),
    })
  );
}

await sendReleaseNotification();
