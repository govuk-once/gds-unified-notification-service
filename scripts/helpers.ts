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
export async function pipeOutput(
  stream: ReadableStream<Uint8Array>,
  prefix: string,
  transformer: (log: string) => string = (l) => l
) {
  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    for (const log of decoder
      .decode(chunk)
      .split('\n')
      .map((e) => e.trimEnd())
      .filter((e) => e.length > 0)) {
      console.log(`${prefix} ${transformer(log)}`);
    }
  }
}

// Runs command as a promise, piping output through to the main process
export function execute(prefix: string, command: string[], transformer: (log: string) => string = (l) => l) {
  const start = Date.now();
  const proc = Bun.spawn(command, {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  pipeOutput(proc.stdout, `[${prefix}]`, transformer);
  pipeOutput(proc.stderr, `[${prefix}]`, transformer);
  return proc.exited.then((exitCode) => [prefix, exitCode, Date.now() - start] as [string, number, number]);
}
