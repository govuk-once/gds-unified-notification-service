/*
This file is configured to enforce specific rules and styles for commit messages in the repository.
Extends @commitlint/config-angular: This configuration extends the rules from the Angular convention for commit messages,
which is a widely used standard that includes a type, an optional scope, and a description.

The message format is as follows:
  type(scope): subject

Rules:
 - Must use one of the following built-in types: build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test.
 - The scope should always be upper case and should never be empty.
 - The scope must reference a specific ticket number like 'JIRA-123'
 - The subject is not case-sensitive and should never be empty.

Example commit messages:
feat(NOT-111): added unit tests
fix(ABC-321): increased font size
chore(JIRA-456): added endpoint
BREAKING CHANGE(JIRA-456): removed an endpoint
*/

export default {
  extends: ["@commitlint/config-angular"],
  rules: {
    "subject-case": [2, "never"],
    "subject-empty": [2, "never"],
    "scope-case": [2, "always", "upper-case"],
    "scope-empty": [2, "never"],
    "scope-should-include-ticket-number": [2, "always"],
    "header-max-length": [0, "always", 512],
  },
  plugins: [
    {
      rules: {
        "scope-should-include-ticket-number": ({ raw }: { raw: string }) => {
          return [
            /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test|BREAKING CHANGE|BREAKING)\([A-Z]{1,6}-[0-9]{1,5}\):/.test(
              raw,
            ),
            `The scope should contain reference to a ticket i.e. JIRA-123, NOT-456 and be in the following format:: feat(NOT-123): description`,
          ];
        },
      },
    },
  ],
};
