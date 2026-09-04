# Environment Setup

Setting up your local environment for the GDS Unified Notification Service.

---

## Prerequisites

| Tool       | Version                                             |
| ---------- | ---------------------------------------------------- |
| Node.js    | `v22.21.1` — see [`.node-version`](/.node-version)   |
| pnpm       | `11.9.0` — see [`packageManager`](/package.json)      |
| checkov    | latest — see [`mise.toml`](/mise.toml)                |
| AWS CLI    | v2                                                    |
| GDS CLI    | see [GDS CLI docs](https://docs.publishing.service.gov.uk/manual/get-started.html) |

[mise-en-place](https://mise.jdx.dev/getting-started.html) is the recommended way to get all of the above (`mise install`), driven by [`mise.toml`](/mise.toml). [fnm](https://github.com/Schniz/fnm) or [nvm](https://github.com/nvm-sh/nvm) also work for Node alone, reading [`.node-version`](/.node-version).

### Node.js and pnpm

Via mise:

```sh
mise install
```

Via fnm/nvm plus a manual pnpm install:

```sh
fnm use   # or: nvm use
npm install -g pnpm@11.9.0
```

### checkov

Via mise (recommended, matches CI's pinned behaviour):

```sh
mise install
```

Manually:

```sh
brew install checkov   # macOS
pipx install checkov   # other platforms
```

Checkov scans the synthesised CDK output (`infrastructure/cdk/cdk.out/`) against [`.checkov.yaml`](/.checkov.yaml) — see [`pnpm run checkov`](/package.json) and the [Deployment Guide](./deployment.md#quality-checks-pryml).

---

## AWS credentials

The service deploys via AWS CDK and needs credentials both for a personal sandbox deploy and for running end-to-end tests against a shared environment.

### Via GDS CLI

Follow the [GDS CLI getting started guide](https://docs.publishing.service.gov.uk/manual/get-started.html) to configure your credentials, and the [GOV.UK Once laptop configuration](https://github.com/govuk-once/laptop-configuration/) instructions to install the required dependencies.

```sh
# Export credentials to assume the sandbox/development admin role
eval $(gds-cli aws once-notifications-development-admin -e)

# Log into the AWS console for that account
gds-cli aws once-notifications-development-admin -l
```

If you're using mise, the following aliases are already available (see [`mise.toml`](/mise.toml) `[shell_alias]`); otherwise add them to your `~/.zshrc`:

```sh
alias "aws:sandbox"='eval $(gds-cli aws once-notifications-development-admin -e)'
alias "aws:sandboxweb"='gds-cli aws once-notifications-development-admin -l'
alias "aws:staging"='eval $(gds-cli aws once-notifications-staging-admin -e)'
alias "aws:stagingweb"='gds-cli aws once-notifications-staging-admin -l'
alias 'aws:reauthnpm'='aws codeartifact login --tool npm --repository registry-prod-repo --domain registry-prod --domain-owner 904690835784 --region eu-west-2'
```

### Verify access

```sh
aws sts get-caller-identity
```

The [developer sandbox setup script](#developer-sandbox-setup) checks that the assumed account ID ends `7518` (the development account) and prompts before continuing if it doesn't — a quick sanity check that you're not about to deploy into the wrong account.

### Private package registry (CodeArtifact)

Dependencies are pulled from a private CodeArtifact npm registry, not the public npm registry. `pnpm install` will fail with 401/403 errors until you've logged in:

```sh
aws codeartifact login --tool npm --repository registry-prod-repo --domain registry-prod --domain-owner 904690835784 --region eu-west-2

# or, via mise:
aws:reauthnpm
```

This login expires periodically (CodeArtifact tokens are short-lived) — re-run it if `pnpm install` starts failing again after previously working.

---

## Repository setup

```sh
git clone git@github.com:govuk-once/gds-unified-notification-service.git
cd gds-unified-notification-service

fnm use            # or: nvm use / mise install
pnpm install
```

### Developer sandbox setup

Each developer gets their own ephemeral CDK stack ("sandbox") rather than sharing a single dev deployment. Initialise it with:

```sh
eval $(gds-cli aws once-notifications-development-admin -e)
pnpm run development:sandbox:setup
```

This is a guided wizard ([`scripts/developer-sandbox-setup.ts`](/scripts/developer-sandbox-setup.ts)) that:

1. Derives an environment name from your git email (`git config --get user.email`), e.g. `damian-a1b2` — an MD5 hash suffix keeps it short and avoids collisions.
2. Writes `region`, `env` and `use_mtls` to `infrastructure/cdk/.env` (git-ignored).
3. Optionally offers to copy select SSM parameters (OneSignal dispatch config, UDP processing config) from the `dev` environment into your sandbox's namespace, so you don't have to source secrets yourself.

Useful variants:

```sh
# Set up on behalf of a colleague's sandbox (pair debugging)
AS_DEVELOPER=colleague@example.gov.uk pnpm run development:sandbox:setup

# Point at a named environment instead of generating a personal sandbox name
AS_ENVIRONMENT=dev pnpm run development:sandbox:setup
```

Sandbox stacks import their VPC, mTLS certificate authority and other shared infrastructure from the `dev` environment via SSM (see [Infrastructure Development Guide: Sandbox environments](./infrastructure-development.md#sandbox-environments)) rather than provisioning their own — this keeps a personal deploy fast and cheap.

Once set up, deploy and iterate with:

```sh
pnpm run development:sandbox:release   # build + cdk deploy
pnpm run development:sandbox:plan      # build + cdk diff (preview only)
```

See the [Deployment Guide](./deployment.md) for what these commands do under the hood, and the [Infrastructure Development Guide](./infrastructure-development.md) for the stack they deploy.

### Verify setup

```sh
pnpm test
```

---

## IDE configuration

### VS Code

Recommended extensions are defined in [`.vscode/extensions.json`](/.vscode/extensions.json); VS Code prompts to install them on opening the repository. Settings in [`.vscode/settings.json`](/.vscode/settings.json) keep formatting consistent with CI.

Key extensions: ESLint, Prettier.

### Other IDEs

Make sure your IDE respects [`eslint.config.ts`](/eslint.config.ts) and [`.prettierrc`](/.prettierrc) — CI's [`pnpm run lint`](/package.json) will fail a PR that doesn't match.

---

## Environment variables

Most day-to-day development needs no environment variables beyond what `development:sandbox:setup` writes to `infrastructure/cdk/.env`. The ones you may need to set directly:

| Variable                  | When needed                    | Description                                                                 |
| -------------------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| `env`                      | CDK deploy/diff/synth              | Deployment environment name (`dev`, `stg`, `prod`, or your sandbox name — see [`infrastructure/cdk/config.ts`](/infrastructure/cdk/config.ts)) |
| `env` (test runner)        | End-to-end tests                    | Target environment for `pnpm run test:e2e` (e.g. `env=dev pnpm run test:e2e`)   |
| `VITEST_DISABLE_MSW`       | Unit tests                          | Bypasses MSW HTTP interception, letting requests hit the real network (debugging only, not for CI) |
| `VITEST_DETAILED_COVERAGE` | Unit tests                          | Switches `test:coverage` output to a per-file breakdown instead of a summary    |

See [`test/e2e/README.md`](/test/e2e/README.md#prerequisites) for the additional credentials and mTLS certificates end-to-end tests need.

---

## Troubleshooting

### `pnpm install` fails with a 401/403 against the private registry

Your CodeArtifact login has expired — re-run `aws:reauthnpm` (see [Private package registry](#private-package-registry-codeartifact)).

### `development:sandbox:setup` warns the AWS account doesn't end in `7518`

You've assumed a role in the wrong account (e.g. staging or production instead of development). Re-run `eval $(gds-cli aws once-notifications-development-admin -e)` and try again — sandboxes are development-account only.

### `pnpm run development:sandbox:setup` can't import SSM parameters from dev

The script fetches values from `/uns-dev/...` and expects the equivalent `/uns-<your-env>/...` parameter to already exist. Run `pnpm run development:sandbox:release` once first to deploy your sandbox stack (which creates the parameter placeholders), then re-run the setup script.

### AWS credentials expired mid-session

Re-run the relevant `eval $(gds-cli aws ... -e)` command — GDS CLI sessions are time-limited.

### Node.js version mismatch

```sh
fnm use   # or: nvm use
```

---

## Related

**Guides:**

- [Deployment Guide](./deployment.md)
- [Infrastructure Development Guide](./infrastructure-development.md)
- [Developer Reference](./developer-reference.md)

**Code:**

- [`scripts/developer-sandbox-setup.ts`](/scripts/developer-sandbox-setup.ts)
- [`infrastructure/cdk/config.ts`](/infrastructure/cdk/config.ts)
