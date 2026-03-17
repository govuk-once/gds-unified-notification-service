/* eslint-disable @typescript-eslint/no-floating-promises */

// Terminal colours
export class Colors {
  static normal = '\x1b[0m';
  static yellow = (t: string) => '\x1b[33m' + t + this.normal;
  static cyan = (t: string) => '\x1b[36m' + t + this.normal;
  static green = (t: string) => '\x1b[32m' + t + this.normal;
  static blue = (t: string) => '\x1b[34m' + t + this.normal;
  static magenta = (t: string) => '\x1b[35m' + t + this.normal;
  static red = (t: string) => '\x1b[31m' + t + this.normal;
}

// Utility which adds specified prefix to process output while
async function pipeOutput(stream: ReadableStream<Uint8Array>, prefix: string) {
  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    for (const log of decoder
      .decode(chunk)
      .split('\n')
      .map((e) => e.trimEnd())
      .filter((e) => e.length > 0)) {
      console.log(`${prefix} ${log}`);
    }
  }
}

// Runs command as a promise, piping output through to the main process
function runCommand(prefix: string, command: string[]) {
  const start = Date.now();
  const proc = Bun.spawn(command, {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  pipeOutput(proc.stdout, `[${prefix}]`);
  pipeOutput(proc.stderr, `[${prefix}]`);
  return proc.exited.then((exitCode) => [prefix, exitCode, Date.now() - start] as [string, number, number]);
}

// Pre commit tasks with labels
const tasks = {
  [Colors.yellow('TS Check')]: ['npm', 'run', 'build:validate'],
  [Colors.cyan('Unit Tests')]: ['npm', 'run', 'test'],
  [Colors.green('Linting')]: ['npm', 'run', 'lint'],
  [Colors.blue('TFLint')]: ['npm', 'run', 'tflint'],
  [Colors.magenta('TF Conventions')]: ['npm', 'run', 'development:organize:tf', '--', '--dry-run'],
};

// Execute all tasks in parallel then add extra logs
Promise.all(Object.entries(tasks).map(([label, args]) => runCommand(label, args))).then((task) => {
  // Log summary
  console.log('\nSummary:');
  for (const [prefix, code, duration] of task) {
    const message = `${code == 0 ? Colors.green('✔') : Colors.red('✘')} ${prefix}`;
    console.log(`${message.padEnd(48, ' ')} - ${duration}ms`);
    if (code !== 0) {
      console.log(`To diagnose: ${tasks[prefix]?.join(' ')}`);
    }
  }

  // Log final results
  if (task.every(([_, exitCode]) => exitCode == 0)) {
    console.log(`\nAll tasks passed ${Colors.green(`✔`)}`);
  }
  if (task.some(([_, exitCode]) => exitCode !== 0)) {
    console.log(Colors.red(`\nAll tasks passed ✔`));
    process.exit(1);
  }
});
