/**
 * Utility helper to assist with arranging TF files in priority order
 * This allows TF files to be ordered easily, and improve readability
 * (read more in terraform/notifications/README.md)
 *
 * Usage:
 * - Insert a new TF file in relevant position
 * i.e. in case of 003.s3.tf && 004.iam.tf - if you want insert a new file inbetween
 *   Create a new file e.g. 004_.apigateway.tf (_ after number is important)
 *   Run `development:organize:tf` - it'll shift up all of the file names up accordingly
 *
 * - Remove a tf file from the sequence
 *   Run `development:organize:tf` - it'll shift all of the file names down accordingly
 *
 * - You can also
 */

import Bun from 'bun';
import { renameSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const isDryRun = process.argv.includes('--dry-run');

// Grab TF files and group them by dir
const dirs: Record<string, string[]> = {};
for await (const path of new Bun.Glob('**/*.tf').scan({ cwd: './' })) {
  const [file, dir] = [basename(path), dirname(path)];
  if (dirs[dir] == undefined) {
    dirs[dir] = [];
  }
  dirs[dir].push(file);
}

let moved = false;
// Sort files in each dir
for (const [dir, files] of Object.entries(dirs)) {
  const sorted = files.sort((a, b) => {
    const aIndex = a.split('.').shift()!;
    const bIndex = b.split('.').shift()!;

    // Compare numbers - if they're different, retain their order
    const numericSort = parseInt(aIndex.replace('_', ''), 10) - parseInt(bIndex.replace('_', ''), 10);
    if (numericSort !== 0) {
      return numericSort;
    }

    // Exlcusive OR, if either file contains _ i.e. 001_.s3.tf vs. 001.blobs.tf - 001_ takes precedence
    if (aIndex.includes('_') || bIndex.includes('_')) {
      if (aIndex.includes('_') !== bIndex.includes('_')) {
        return aIndex.includes('_') ? -1 : 1;
      }
    }

    // Otherwise leave order as is
    return 0;
  });

  for (let i = 0; i < sorted.length; i++) {
    const file = sorted[i];
    const newName = [i.toString().padStart(3, '0'), ...file.split('.').slice(1)].join('.');

    if (file !== newName) {
      console.log(`File ${file} -> ${newName} in ${dir}`);
      moved = true;
      if (isDryRun == false) {
        renameSync(join(dir, file), join(dir, newName));
      }
    }
  }
}

if (moved && isDryRun) {
  console.log(`Process exited with an error, as the files order is incorrect`);
  console.log(`Please run \`npm run development:organize:tf\` to re-arrange TF, or do it manually`);
  process.exit(1);
}
