import esbuild from 'esbuild';
import { existsSync, rmSync } from 'fs';
import { globSync } from 'glob';
import path from 'path';

const ROOT = path.dirname(import.meta.dir);
const OUT_DIR = path.resolve(ROOT, 'dist');

// Remove previous build artifacts
if (existsSync(OUT_DIR)) {
  rmSync(OUT_DIR, {
    recursive: true,
  });
}

const buildHandlers = async (dir: string) => {
  try {
    const LAMBDAS_DIR = dir;
    console.log(`Building lamdas in ${LAMBDAS_DIR}`);
    const entryPoints = globSync('**/*.ts', {
      cwd: LAMBDAS_DIR,
      absolute: true,
    }).filter((name) => name.endsWith('test.unit.ts') == false);

    if (entryPoints.length === 0) {
      console.error(`No lambda entry points found in: ${LAMBDAS_DIR}`);
      return;
    }

    for (const entrypoint of entryPoints) {
      const id = path.basename(path.dirname(entrypoint));
      await esbuild.build({
        entryPoints: [entrypoint],
        outfile: path.join(OUT_DIR, id, 'index.mjs'),
        bundle: true,
        minify: true,
        platform: 'node',
        target: 'node24',
        format: 'esm',
        sourcemap: 'external',
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
  await buildHandlers(path.resolve(ROOT, 'src', 'lambdas', 'http'));
  console.log('');
  await buildHandlers(path.resolve(ROOT, 'src', 'lambdas', 'trigger'));
})();
