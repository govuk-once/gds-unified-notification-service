import { Colors, execute } from 'scripts/helpers';

// Pre commit tasks with labels
const tasks = {
  [Colors.yellow('TS Check')]: 'pnpm run build:validate',
  [Colors.cyan('Unit Tests')]: 'pnpm run test:unit',
  [Colors.green('Linting')]: 'pnpm run lint',
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
