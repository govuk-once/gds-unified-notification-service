## About The Project

GDS Unified Notification Service

This service is a notification system that will be used by multiple services within government.
Notifications will be sent to the GOV.UK to either a user or a group of users.
This service is ran with AWS using serverless architecture.

### Built With

- Node.js v22.21.1 (LTS) & NPM v11.6
- Terraform v1.14.1
- TFlint v0.60.0
- TFSec v1.28.14
- Checkov v3.2.490

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
npm install
```

5. Initialize terraform - relies on gds-cli being already configured

This guided wizard will create a tfstate bucket within AWS based on your developer email, and initialize TF on your behalf.

```sh
eval $(gds-cli aws {name_of_sandbox_or_dev_account} -e --skip-ip-range-checks)
npm run development:sandbox:setup
```

6. Recommended - Install checkov & tfsec - run them before publishing PRs, these steps are also ran during the PR pipelines, however this can allows for a quicker feedback loop:

```sh
brew install tfsec
brew install checkov

npm run tfsec
npm run checkov
```

Note: If you are using mise-en-place, you can skip brew install step.

## Setting up dev / sandbox environmnent

There's a set of utility scripts allows easy setting up of brand new developers within developer account.

Pre-requisites: access to AWS account, [gds-cli](https://docs.publishing.service.gov.uk/manual/get-started.html) setup locally, git config user.name configured correctly.

Note: for a bit of a shortcut it's worth adding the following two aliases into your ~/.zshrc

```sh
alias notificationssandbox='eval $(gds-cli aws once-notifications-development-admin -e)'
alias notificationssandboxweb='gds-cli aws once-notifications-development-admin -l'
```

First one authenticates your shell session with the sandbox aws account, second one opens the AWS console with a pre-authenticated session within the correct account.

```sh
npm run development:sandbox:setup
```

This executes a guided wizard which should generate a tfstate bucket, set up contents versioning and generates `./terraform/notifications/terraform.tfvars` based on email configured within git. This prevents developers from running into conflicts while sharing sandbox environment.

After the initial setup is completed, another 2 commands can be used to release to sandbox

```sh
npm run development:sandbox:release
npm run development:sandbox:release:plan
```

Both versions will convert TS bundles into JS, and execute terraform.
Plan will only output the expected changes, release will allow deploying to AWS (sandbox).

## Pre-commit hooks

- Husky - Automatically lint commit messages. [Husky](https://typicode.github.io/husky)
- commitlint - Lint commit messages to adhere to a commit convention. [commitlint](https://github.com/conventional-changelog/commitlint)
- TFLint - Framework for terraform to find possible errors for Major Cloud providers. [TFLint](https://github.com/terraform-linters/tflint)

## Contact

Solution Architect: Nathaniel Greenwood
Technical Lead: Damian Pokorski
Developers: Ryan Parker, Toby Fox

```

```
