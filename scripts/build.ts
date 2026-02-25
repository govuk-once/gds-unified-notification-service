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
    const namespace = basename(dir);
    console.log(`Building namespace ${namespace} ( ./${relative(ROOT, dir)} )`);
    const entryPoints = [
      ...new Glob('**/*.ts').scanSync({
        cwd: dir,
        absolute: true,
      }),
    ].filter((name) => name.endsWith('test.unit.ts') == false);

    if (entryPoints.length === 0) {
      console.error(`No lambda entry points found in ./${relative(ROOT, dir)}`);
      return;
    }

    for (const entrypoint of entryPoints) {
      const id = join(namespace, '.', basename(dirname(entrypoint)));
      await esbuild.build({
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
      });
      console.log(`${id} built successfully`);
    }
  } catch (error) {
    console.log('esbuild failure', error);
    process.exit(1);
  }
};

void (async () => {
  await buildHandlers(resolve(ROOT, 'src', 'lambdas', 'pso'));
  console.log('');
  await buildHandlers(resolve(ROOT, 'src', 'lambdas', 'flex'));
})();
