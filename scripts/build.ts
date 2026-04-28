import { Glob } from 'bun';
import esbuild from 'esbuild';
import { existsSync, rmSync } from 'fs';
import { basename, dirname, join, relative, resolve } from 'path';
import { Colors, execute } from 'scripts/helpers';

const ROOT = dirname(import.meta.dir);
const OUT_DIR = resolve(ROOT, 'dist');

// Remove previous build artifacts
if (existsSync(OUT_DIR)) {
  rmSync(OUT_DIR, {
    recursive: true,
  });
}

const buildHandlers = async (dir: string) => {
  try {
    const namespace = basename(dir);
    const entryPoints = [
      ...new Glob('**/*.ts').scanSync({
        cwd: dir,
        absolute: true,
      }),
    ]
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
    await Promise.allSettled(fns);
  } catch (error) {
    console.log(Colors.red('Esbuild failure'), error);
    process.exit(1);
  }
};

void (async () => {
  await Promise.allSettled([
    buildHandlers(resolve(ROOT, 'src', 'lambdas', 'pso')),
    buildHandlers(resolve(ROOT, 'src', 'lambdas', 'flex')),
  ]);
})();
