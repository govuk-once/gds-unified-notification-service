## Husky Configuration

In this repository, we utilize Husky to enforce best practices and ensure consistency across our codebase. Specifically, we use pre-commit and commit message hooks to maintain high-quality code.

## Pre-Commit Hooks

Before committing changes, Husky runs a series of checks to ensure that our code meets certain standards. These checks include:

- TS Check: A TypeScript compilation step that ensures our code is syntactically correct.
- Linting: An ESLint check that enforces TS coding conventions.
- TF Validate && TF Lint: A validation step that ensures our Terraform configurations are valid, followed by linting step to ensure coding styles
- TF Conventions: We have a custom naming conventions defined here [./../infrastructure/terraform/README.md](./../infrastructure/terraform/README.md), outlining our naming approach
- Unit testing (Vitest): Executing all of the unit testing before committing ensures no faulty code is commited

These hooks run automatically before each commit, allowing us to catch and fix errors early on in the development process. By running these checks, we can ensure that our code is clean, efficient, and follows best practices.

Pre-commit hooks can also be triggered directly via:

```sh
npm run pre-commit
```

This is the same command as the one triggered by husky in [./pre-commit](./pre-commit)

## Commit Message Hooks

In addition to pre-commit hooks, Husky combined with commitlint also enforces commit message formatting using a hook that ensures commit messages follow Angular conventions. This includes checking for proper commit message structure, including a descriptive subject line and a meaningful body.

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

Configuration for the above is triggered via [./commit-msg](./commit-msg), and advanced configuration is defined via: [./../commitlint.config.ts](./../commitlint.config.ts).
