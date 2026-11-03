import esbuild from 'esbuild';
import { existsSync, globSync, rmSync } from 'fs';
import { basename, dirname, join, relative, resolve } from 'path';
import { Colors, execute } from 'scripts/helpers';
import { parseArgs } from 'node:util';
import { mkdirSync } from 'node:fs';

const ALLOWED_HANDLERS = ['pso', 'flex'];
const ROOT = dirname(import.meta.dirname);
const OUT_DIR = resolve(ROOT, 'dist');

// Parse command line arguments for --handler option
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    handler: {
      type: 'string',
      multiple: true,
    },
  },
});
if (!values.handler || values.handler.some((h) => !ALLOWED_HANDLERS.includes(h))) {
  console.error(`Invalid handler specified. Allowed values are: ${ALLOWED_HANDLERS.join(', ')}`);
  process.exit(1);
}

const buildHandlers = async (dir: string, namespace: string) => {
  try {
    const entryPoints = [
      ...globSync('**/*.ts', {
        cwd: dir,
      }),
    ]
      .map((relative) => join(dir, relative))
      .filter((name) => name.endsWith('test.unit.ts') == false)
      .sort();

    if (entryPoints.length === 0) {
      console.error(`No lambda entry points found in ./${relative(ROOT, dir)}`);
      return;
    }
    const fns = entryPoints.map((entrypoint) => {
      const id = join(namespace, '.', basename(dirname(entrypoint)));
      console.log(` ${Colors.blue(`Building...`)} ${id}`);
      return esbuild
        .build({
          entryPoints: [entrypoint],
          outfile: join(OUT_DIR, id, 'index.mjs'),
          bundle: true,
          minify: true,
          platform: 'node',
          target: 'node22',
          format: 'esm',
          sourcemap: true,
          banner: {
            js: [
              // https://middy.js.org/docs/best-practices/bundling/#esbuild
              "import { createRequire } from 'module';",
              'const require = createRequire(import.meta.url);',
            ].join('\n'),
          },
        })
        .then(() => {
          console.log(` ${Colors.cyan(`Zipping....`)} ${id}`);
          return execute(id, [`zip`, `-j`, `-r`, `${join(OUT_DIR, id)}.zip`, join(OUT_DIR, id), `-q`]);
        })
        .then(() => console.log(` ${Colors.green(`Finished...`)} ${id} ${Colors.green(`✔`)}`));
    });
    await Promise.all(fns);
  } catch (error) {
    console.log(Colors.red('Esbuild failure'), error);
    process.exit(1);
  }
};

const main = async () => {
  mkdirSync(OUT_DIR, { recursive: true });

  // Removes the existing build output for each handler and rebuilds them
  const promises: Promise<void>[] = [];
  for (const handler of values.handler!) {
    const handlerDir = join(OUT_DIR, handler);
    if (existsSync(handlerDir)) {
      rmSync(handlerDir, { recursive: true });
    }
    promises.push(buildHandlers(resolve(ROOT, 'packages', handler, 'src'), handler));
  }
  // Wait for all build processes to finish
  await Promise.allSettled(promises);
};

await main();
