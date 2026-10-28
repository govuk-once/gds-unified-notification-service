import { execSync } from 'child_process';
import { Colors, execute } from 'scripts/helpers';

const stagedFiles = execSync('git diff --name-only --cached', { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);

// Pre commit tasks with labels
const tasks = {
  [Colors.yellow('TS Check')]: 'pnpm run build:validate',
  [Colors.cyan('Unit Tests')]: 'pnpm run test:unit --reporter=minimal',
  [Colors.green('Linting')]: 'pnpm run lint',
  ...(stagedFiles.length > 0 && {
    [Colors.magenta('Spellcheck (Staged)')]:
      `pnpm exec cspell --no-progress --config .cspell.json ${stagedFiles.join(' ')}`,
  }),
};

// Execute all tasks in parallel then add extra logs
await Promise.all(Object.entries(tasks).map(([label, cmd]) => execute(label, cmd.split(' ')))).then((task) => {
  // Log summary
  console.log('\nSummary:');
  for (const [prefix, code, duration] of task) {
    const message = `${code == 0 ? Colors.green('✔') : Colors.red('✘')} ${prefix}`;
    console.log(`${message.padEnd(48, ' ')} - ${duration}ms`);
    if (code !== 0) {
      console.log(`To diagnose: ${tasks[prefix ?? '']}\n`);
    }
  }

  // Log final results
  if (task.every(([, exitCode]) => exitCode == 0)) {
    console.log(`\nAll tasks passed ${Colors.green(`✔`)}`);
  }
  if (task.some(([, exitCode]) => exitCode !== 0)) {
    console.log(Colors.red(`\nSome tasks failed ✘`));
    process.exit(1);
  }
});
