import { spawn } from 'child_process';
import type { Readable } from 'stream';

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

// Utility which adds specified prefix to process output
export async function pipeOutput(stream: Readable, prefix: string) {
  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    const decodedChunk = typeof chunk === 'string' ? chunk : decoder.decode(chunk as NodeJS.AllowSharedBufferSource);
    for (const log of decodedChunk
      .split('\n')
      .map((e) => e.trimEnd())
      .filter((e) => e.length > 0)) {
      console.log(`${prefix} ${log}`);
    }
  }
}

// Runs command as a promise, piping output through to the main process
export function execute(prefix: string | undefined, command: string[]): Promise<[string | undefined, number, number]> {
  const start = Date.now();
  const [cmd, ...args] = command;
  const proc = spawn(cmd, args);

  const formattedPrefix = (prefix ? `[${prefix}]` : '').split(process.cwd()).join(`./`);

  if (proc.stdout) pipeOutput(proc.stdout, formattedPrefix);
  if (proc.stderr) pipeOutput(proc.stderr, formattedPrefix);

  return new Promise((resolve) => {
    proc.on('close', (exitCode) => resolve([prefix, exitCode ?? 0, Date.now() - start]));
    proc.on('error', () => resolve([prefix, 1, Date.now() - start]));
  });
}

// Helper FN to simplify promise handling, and avoid nested try catches
export const unwrap = async <Result>(promise: Promise<Result>): Promise<[Result, undefined] | [undefined, Error]> => {
  try {
    return [await promise, undefined];
  } catch (error) {
    return [undefined, error as Error];
  }
};
