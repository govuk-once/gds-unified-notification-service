/* eslint-disable @typescript-eslint/no-floating-promises */

import { Colors, execute } from 'scripts/helpers';

// Pre commit tasks with labels
const tasks = {
  [Colors.yellow('TS Check')]: 'npm run build:validate',
  [Colors.cyan('Unit Tests')]: 'npm run test:unit',
  [Colors.green('Linting')]: 'npm run lint',
  [Colors.blue('TFLint')]: 'npm run tflint',
  [Colors.magenta('TF Conventions')]: 'npm run development:organize:tf -- --dry-run',
};

// Execute all tasks in parallel then add extra logs
Promise.all(Object.entries(tasks).map(([label, cmd]) => execute(label, cmd.split(' ')))).then((task) => {
  // Log summary
  console.log('\nSummary:');
  for (const [prefix, code, duration] of task) {
    const message = `${code == 0 ? Colors.green('✔') : Colors.red('✘')} ${prefix}`;
    console.log(`${message.padEnd(48, ' ')} - ${duration}ms`);
    if (code !== 0) {
      console.log(`To diagnose: ${tasks[prefix]}\n`);
    }
  }

  // Log final results
  if (task.every(([_, exitCode]) => exitCode == 0)) {
    console.log(`\nAll tasks passed ${Colors.green(`✔`)}`);
  }
  if (task.some(([_, exitCode]) => exitCode !== 0)) {
    console.log(Colors.red(`\nSome tasks failed ✘`));
    process.exit(1);
  }
});
