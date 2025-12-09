import esbuild from 'esbuild';
import { rimrafSync } from 'rimraf';
import path from 'path';
import { globSync } from 'glob';
import { fileURLToPath } from 'url';
import fs from 'fs';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LAMBDAS_DIR = path.resolve(__dirname, 'src', 'lambdas');
const OUT_DIR = path.resolve(__dirname, 'dist');
const ARTIFACT_DIR = path.resolve(__dirname, 'artifacts')
const ZIP_OUTPUT_FILE = path.resolve(ARTIFACT_DIR, 'deployment.zip')

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
    console.error(`No lambda entry points found in: {ENTRY_POINTS}`);
    process.exit(1);
}

rimrafSync(OUT_DIR);
rimrafSync(ARTIFACT_DIR);

esbuild.build({
    entryPoints: entryPoints,
    outdir: OUT_DIR,
    outbase: 'src',
    bundle: true,
    minify: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    sourcemap: 'linked',
    external: ['@aws-sdk/*', 'aws-sdk']

}).then(() => {
    console.log(`esbuild successful`);
    createZipArchive(OUT_DIR, ZIP_OUTPUT_FILE);

}).catch((error) => {
    console.log("esbuild failure", error);
    process.exit(1);
});
