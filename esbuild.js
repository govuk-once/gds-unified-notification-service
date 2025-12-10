import archiver from 'archiver';
import esbuild from 'esbuild';
import fs from 'fs';
import { globSync } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LAMBDAS_DIR = path.resolve(__dirname, 'src', 'lambdas');
const OUT_DIR = path.resolve(__dirname, 'dist');
const ARTIFACT_DIR = path.resolve(__dirname, 'artifacts');

const removeDir = (dirPath) => {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { 
            recursive: true
        });
    }
}

const createZipArchive = (sourceDir, targetFile) => {
    return new Promise((resolve, reject) => {
        fs.mkdirSync(ARTIFACT_DIR, {
            recursive: true
        });

        const output = fs.createWriteStream(targetFile);

        const archive = archiver('zip', {
            zlib: {
                level: 9
            }
        });

        output.on('close', () => {
            resolve();
        });

        archive.on('error', (error) => {
            reject(error);
        });

        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
};

const entryPoints = globSync('**/*.ts', {
    cwd: LAMBDAS_DIR, absolute: true
});

if (entryPoints.length === 0) {
    console.error(`No lambda entry points found in: ${LAMBDAS_DIR}`);
    process.exit(1);
}

removeDir(OUT_DIR);
removeDir(ARTIFACT_DIR);

(async () => {
  try {
    for(const entrypoint of entryPoints) {
      const id = path.basename(path.dirname(entrypoint));
      await esbuild.build({
          entryPoints: [entrypoint],
          outdir: path.join(OUT_DIR, id),
          bundle: true,
          minify: true,
          platform: 'node',
          target: 'node24',
          format: 'cjs',
          sourcemap: 'linked'
      })
      const ZIP_OUTPUT_FILE = path.resolve(ARTIFACT_DIR, `${id}.zip`);
      await createZipArchive(OUT_DIR, ZIP_OUTPUT_FILE)
      console.log(`${id} built successfully`)
    }
  } catch(error) {
    console.log("esbuild failure", error);
    process.exit(1);
  }
})();
