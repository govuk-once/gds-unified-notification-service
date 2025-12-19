import archiver from 'archiver';
import esbuild from 'esbuild';
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { globSync } from 'glob';
import path from 'path';

const ROOT = path.dirname(import.meta.dir);
const OUT_DIR = path.resolve(ROOT, 'dist');
const ARTIFACT_DIR = path.resolve(ROOT, 'artifacts');

// Remove previous build artifacts
for (const dir of [ARTIFACT_DIR, OUT_DIR]) {
  if (existsSync(dir)) {
    rmSync(dir, {
      recursive: true,
    });
  }
}

// Util for zipping archives
const createZipArchive = (sourceDir: string, targetFile: string) => {
  return new Promise<void>((resolve, reject) => {
    mkdirSync(ARTIFACT_DIR, {
      recursive: true,
    });

    const output = createWriteStream(targetFile);
    output.on('close', () => {
      resolve();
    });

    const archive = archiver('zip', {
      zlib: {
        level: 9,
      },
    });
    archive.on('error', (error) => {
      reject(error);
    });

    archive.pipe(output);
    for (const file of readdirSync(sourceDir)) {
      archive.file(path.join(sourceDir, file), { name: file });
    }
    archive.finalize();
  });
};

const buildHandlers = async (dir: string) => {
  try {
    const LAMBDAS_DIR = dir;
    console.log(`Building lamdas in ${LAMBDAS_DIR}`);
    const entryPoints = globSync('**/*.ts', {
      cwd: LAMBDAS_DIR,
      absolute: true,
    });

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
      const ZIP_OUTPUT_FILE = path.resolve(ARTIFACT_DIR, `${id}.zip`);
      await createZipArchive(path.join(OUT_DIR, id), ZIP_OUTPUT_FILE);
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
