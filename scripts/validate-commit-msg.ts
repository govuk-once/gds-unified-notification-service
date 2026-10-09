import { readFileSync } from 'fs';
import { Colors } from 'scripts/helpers';

const PATTERN =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test|BREAKING CHANGE|BREAKING)\([A-Z]{1,6}-[0-9]{1,5}\): .+/;

const msgFile = process.argv[2];
if (!msgFile) {
  console.error(Colors.red('No commit message file path provided'));
  process.exit(1);
}

const msg = readFileSync(msgFile, 'utf-8').trim();

if (!PATTERN.test(msg)) {
  console.error(
    [
      Colors.red('\n  ✘ Invalid commit message:') + ` ${msg}`,
      '  Expected: type(SCOPE): subject',
      '  Types:    build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test|BREAKING CHANGE|BREAKING',
      '  Scope:    uppercase ticket ref e.g. NOT-123, JIRA-456\n',
      '  Examples: feat(NOT-111): added unit tests',
      '            fix(ABC-321): increased font size\n',
    ].join(`\n`)
  );
  process.exit(1);
}
