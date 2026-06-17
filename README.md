## About The Project

GDS Unified Notification Service
This service is a notification system that will be used by multiple services within government.
Notifications will be sent to the GOV.UK to either a user or a group of users.
This service is ran with AWS using serverless architecture.

### Built With

- Node.js v22.21.1 (LTS) & pnpm v10.26.0
- Checkov v3.2.490
- AWS CDK

Recommending use of [fnm](https://github.com/Schniz/fnm) or [nvm](https://github.com/nvm-sh/nvm), [tfenv](https://github.com/tfutils/tfenv)

[Mise-en-place](https://mise.jdx.dev/getting-started.html) [configuration](./mise.toml) is set up to install the above too.

## Installation

1. Ensure you have fnm/nvm and tfenv

2. Clone the repository:

```sh
git clone git@github.com:govuk-once/gds-unified-notification-service.git
```

3. Enable relevant utils

```sh
fnm use # or nvm use
tfenv use
```

4. Install dependencies:

```sh
pnpm install
```

5. Initialize CDK - relies on gds-cli being already configured

This guided wizard will create a tfstate bucket within AWS based on your developer email, and initialize CDK on your behalf.

```sh
eval $(gds-cli aws once-notifications-development-admin -e)
pnpm run development:sandbox:setup
```

6. Recommended - Install checkov - run them before publishing PRs, these steps are also ran during the PR pipelines, however this can allows for a quicker feedback loop:

```sh
brew install checkov
# Pre-configured aliases
pnpm run checkov
```

Note: If you are using mise-en-place, you can skip brew install step.

## Setting up dev / sandbox environmnent

There's a set of utility scripts allows easy setting up of brand new developers within developer account.

Pre-requisites: access to AWS account, [gds-cli](https://docs.publishing.service.gov.uk/manual/get-started.html) setup locally, git config user.name configured correctly.

Note: for a bit of a shortcut it's worth adding the following two aliases into your ~/.zshrc
If you are using mise-en-place, those aliases are [already setup](https://mise.jdx.dev/shell-aliases.html) via [./mise.toml](./mise.toml)

```sh
alias "aws:sandbox"='eval $(gds-cli aws once-notifications-development-admin -e)'
alias "aws:sandboxweb"='gds-cli aws once-notifications-development-admin -l'
alias "aws:staging"='eval $(gds-cli aws once-notifications-staging-admin -e)'
alias "aws:stagingweb"='gds-cli aws once-notifications-staging-admin -l'
alias 'aws:reauthnpm'='aws codeartifact login --tool npm --repository registry-prod-repo --domain registry-prod --domain-owner 904690835784 --region eu-west-2'
```

First one authenticates your shell session with the sandbox aws account, second one opens the AWS console with a pre-authenticated session within the correct account.

```sh
pnpm run development:sandbox:setup
```

This executes a guided wizard which should generate a tfstate bucket, set up contents versioning and generates `./infrastructure/cdk/.env` based on email configured within git. This prevents developers from running into conflicts while sharing sandbox environment.
Also, if mTLS is enables, it pulls mTLS certificates and domain name into the repository for end to end testing locally.

After the initial setup is completed, another 2 commands can be used to release to sandbox

```sh
pnpm run development:sandbox:release
pnpm run development:sandbox:release:plan
```

Both versions will convert TS bundles into JS, and execute CDK.
Plan will only output the expected changes, release will allow deploying to AWS (sandbox).

## Testing

Within this project there are multiple ways of triggering tests, there are also various flags that can adjust certain configurations to provide additional flexibility during development:

```sh
# Standard unit tests
pnpm run test
# Unit tests reporting coverage
pnpm run test:coverage
# End to end tests
pnpm run test:e2e

# Additional env vars can also be supplied:
## Surpress console output
VITEST_SILENT=true
## Disables Mock service worker - allowing http requests to go to internet instead of mock interceptor
VITEST_DISABLE_MSW=true
## Changes the test:coverage output to a per file structure instead of summary
VITEST_DETAILED_COVERAGE=true

## Sample usage
VITEST_DETAILED_COVERAGE=true VITEST_SILENT=true pnpm run test:coverage
```

We also have some additional flags that can adjust the way

End to end testing require mTLS authentication to be setup locally, to test both PSO and FLEX endpoints. To setup the correct authentication, run the developer setup script to setup this authentication.
Make sure these credentials are not added to git.

## Pre-commit hooks

A quick summary:

- Husky - Automatically lint commit messages. [Husky](https://typicode.github.io/husky)
- commitlint - Lint commit messages to adhere to a commit convention. [commitlint](https://github.com/conventional-changelog/commitlint)

Read more in : [./.husky/README.md](./.husky/README.md)

## Github Actions

This repository is using Github Actions to support pull request review process and releasing to non production environments.
Read more [./.github/README.md](./.github/README-Pipelines.md)

## Github Pages

This repository is automatically updating the following API pages on release to main

- Public Service Organization API - https://govuk-once.github.io/gds-unified-notification-service/pso/ -

- Flex API - https://govuk-once.github.io/gds-unified-notification-service/flex/ -

## Dependency management

In order to keep dependencies up to date & ensure the platform maintains high level of security, a minor utility is available via:

```sh
pnpm run upgrade
```

## Contact

Solution Architect: Nathaniel Greenwood

Technical Lead: Damian Pokorski

Developers: Ryan Parker, Toby Fox, Juno Nicholson
