import { Glob } from 'bun';
import esbuild from 'esbuild';
import { existsSync, rmSync } from 'fs';
import { basename, dirname, join, relative, resolve } from 'path';

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
    const LAMBDAS_DIR = dir;
    console.log(`Building lamdas in ./${relative(ROOT, LAMBDAS_DIR)}`);
    const entryPoints = [
      ...new Glob('**/*.ts').scanSync({
        cwd: LAMBDAS_DIR,
        absolute: true,
      }),
    ].filter((name) => name.endsWith('test.unit.ts') == false);

    if (entryPoints.length === 0) {
      console.error(`No lambda entry points found in ./${relative(ROOT, LAMBDAS_DIR)}`);
      return;
    }

    for (const entrypoint of entryPoints) {
      const id = basename(dirname(entrypoint));
      await esbuild.build({
        entryPoints: [entrypoint],
        outfile: join(OUT_DIR, id, 'index.mjs'),
        bundle: true,
        minify: true,
        platform: 'node',
        target: 'node22',
        format: 'esm',
        sourcemap: true,
        loader: {
          '.node': 'copy',
        },
        banner: {
          js: [
            // https://middy.js.org/docs/best-practices/bundling/#esbuild
            "import { createRequire } from 'module';",
            'const require = createRequire(import.meta.url);',
          ].join('\n'),
        },
      });
      console.log(`${id} built successfully`);
    }
  } catch (error) {
    console.log('esbuild failure', error);
    process.exit(1);
  }
};

(async () => {
  await buildHandlers(resolve(ROOT, 'src', 'lambdas', 'http'));
  console.log('');
  await buildHandlers(resolve(ROOT, 'src', 'lambdas', 'trigger'));
})();
