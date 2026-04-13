import { CloudWatchLogsClient, ListLogGroupsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { getConfig, prefix } from 'scripts/developer-sandbox-setup';
import { Colors, execute } from 'scripts/helpers';

const config = await getConfig();
const namespace = `/aws/lambda/${prefix}-${config.env}-`;

// Grab all of the groups for the users
const groups = (
  (
    await new CloudWatchLogsClient().send(
      new ListLogGroupsCommand({
        logGroupNamePattern: `^${namespace}`,
        logGroupClass: 'STANDARD',
      })
    )
  ).logGroups ?? []
).map((x) => x.logGroupName!);

// Tails specific log group and pipes output back into terminal
const tail = async (logGroup: string) => {
  // Pick random colour for each log group
  const label = [Colors.yellow, Colors.cyan, Colors.green, Colors.blue, Colors.magenta, Colors.red][
    Math.floor(Math.random() * 6)
  ](logGroup.replace(namespace, ''));
  console.log(`Tailing ${label}`);

  await execute(label, [`aws`, `logs`, `tail`, logGroup, `--follow`, `--since`, `5s`], (log: string) => {
    // Strip timestamps & log groups
    return (
      log
        .split(' ')
        .slice(2)
        .join(' ')
        // Highlight "message", timestamps for improved readability
        .split('"message"')
        .join(Colors.green(`"message"`))
        .split('"timestamp"')
        .join(Colors.yellow(`"timestamp"`))
        .split('"level"')
        .join(Colors.cyan(`"level"`))
    );
  });
};

console.log(`Looking into namespace ${namespace}`);
await Promise.all(groups.map((group) => tail(group))).then(() => {
  console.log(`Finished logging`);
});
