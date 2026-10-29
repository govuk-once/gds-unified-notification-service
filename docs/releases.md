# Releases and Versioning

How release versions are computed, what a release produces, and how a release is announced. Releases are fully automated with [semantic-release](https://github.com/semantic-release/semantic-release); no manual tagging is needed.

---

## How versioning is determined

On every push to `main`, the `release` job in [`main.release.yml`](/.github/workflows/main.release.yml) runs `pnpm run semantic:release` before anything is deployed. It reads [`.releaserc`](/.releaserc) and analyses every commit since the last release tag using the Angular commit-analyzer preset, with these release rules:

| Commit type in the squashed message | Version bump | Example |
| --- | --- | --- |
| `BREAKING` or `BREAKING CHANGE` | Major (`2.0.0`) | `BREAKING CHANGE(NOT-789): drop legacy field` |
| `feat` | Minor (`1.2.0`) | `feat(NOT-123): add preferences endpoint` |
| Anything else (`fix`, `chore`, `docs`, `refactor`, `style`, `test`, `build`, `ci`, `revert`, …) | Patch (`1.1.1`) | `fix(NOT-456): handle empty payload` |

> Every type other than `feat` and the breaking types bumps **patch**. The `.releaserc` rules include `{ type: '*', release: 'patch' }` and a `{ message: '*', release: 'patch' }` fallback, so a `chore` or `docs` commit still cuts a release. In practice every merge to `main` produces a new version.

`feat!:`-style bang syntax is **not** a breaking-change trigger here. Only the `BREAKING` / `BREAKING CHANGE` types bump major, and the PR title check rejects `!` (see [Commit message format](#commit-message-format)).

---

## What a release produces

[`.releaserc`](/.releaserc) configures four plugins:

| Plugin | What it does here |
| --- | --- |
| `@semantic-release/commit-analyzer` | Computes the next version using the rules above |
| `@semantic-release/npm` (`npmPublish: false`) | Bumps `version` in `package.json` **in the CI workspace only**. Nothing is published |
| `@semantic-release/exec` | `verifyReleaseCmd` writes `semVer=<version>` to `$GITHUB_OUTPUT` for the deploy jobs. `prepareCmd` runs `pnpm run changelog` |
| `@semantic-release/github` | Creates a **GitHub Release** for tag `v<version>` with `CHANGELOG.md` attached as the "Full Changelog" asset. Success/failure comments on PRs and issues are disabled |

In order, a release:

1. Creates and pushes the git tag `v<version>`.
2. Generates `CHANGELOG.md` with [`scripts/generate-changelog.ts`](/scripts/generate-changelog.ts). It walks every tag, groups commits by **ISO week**, then by type (Breaking Changes first) and Jira ticket, linking PRs and `NOT-` tickets (`NOT-000` is treated as untracked). Optional hand-written summaries for each week are read from [`scripts/changelog-summaries.json`](/scripts/changelog-summaries.json), keyed by `YYYY-Www`.
3. Publishes the GitHub Release with the changelog attached.
4. Exposes `steps.release.outputs.semVer`, which the deploy jobs pass on as `VERSION=<semver>@<sha>`.

There is no `@semantic-release/git`, so neither the `package.json` version bump nor `CHANGELOG.md` is committed back. `package.json` reading `"version": "0.0.0"` in the working tree is expected. The real version lives in the git tags and GitHub Releases. To read release notes, use the repository's **Releases** page, or run `pnpm run changelog` locally to regenerate `CHANGELOG.md` (git-ignored; don't commit it).

> To add context to a week's changelog entry, add or edit that week's key in `scripts/changelog-summaries.json` in a normal PR. The next release picks it up.

A git tag means the code is merged and versioned. It does **not** mean the code has reached production. See [Deployment Guide: Release](./deployment.md#release-mainreleaseyml) for how `dev`, `staging` and `production` deploy after the release step.

---

## Commit message format

PRs are squash-merged, so the PR title becomes the commit on `main` and is what the commit analyser and changelog read. The format is:

```text
<type>(<TICKET-REF>): <description>
```

- **Type** must be one of: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`, `BREAKING CHANGE`, `BREAKING`.
- **Scope is mandatory** and must be an upper-case ticket reference: 1–6 letters, a hyphen, 1–5 digits (`NOT-434`, `JIRA-1`, up to `ABCDEF-12345`).
- **Subject** must not be empty; case is unrestricted. No `!` after the scope.

```text
feat(NOT-111): added unit tests
fix(ABC-321): increased font size
chore(JIRA-456): added endpoint
BREAKING CHANGE(JIRA-456): removed an endpoint
```

The same rule is enforced in two places:

| Where | What | Source |
| --- | --- | --- |
| Local commits | Husky `commit-msg` hook | [`scripts/validate-commit-msg.ts`](/scripts/validate-commit-msg.ts), see [`.husky/README.md`](/.husky/README.md) |
| PR titles (what lands on `main`) | `Validate PR Title` check | [`pr.title-validation.yml`](/.github/workflows/pr.title-validation.yml) |

If you change the format, change both. `validate-commit-msg.ts` is the source of truth.

Dependabot PRs skip the title check, and Dependabot commits don't go through the local hook. Their `fix(deps): ...` titles are parsed as ordinary conventional commits (a patch release) when they land on `main`.

---

## Deployment notifications

Every environment deploy announces itself. After `pnpm run cdk:deploy` succeeds, the **Announce release** step in [`_deploy.yml`](/.github/workflows/_deploy.yml) runs `pnpm run release:announcement` ([`scripts/release-announcement.ts`](/scripts/release-announcement.ts)), which:

1. Finds the environment's release topic, `uns-<env>-sns-topic-releases` (created in `UNSCommon`).
2. Publishes an AWS Chatbot custom notification: `:rocket: UNS deployed to <env>`, with the version and a link to the GitHub Release for `v<semver>`, or to the workflow run when there is no semantic version (manual deploys).

The topic is forwarded to Slack by AWS Chatbot when `alerts/slack/workspaceId` and `alerts/slack/releaseChannelId` are set in that environment's SSM namespace (see [Configuration: Slack](./configuration.md#slack-alerts-and-release-announcements)). Expect one message per environment per release (`dev`, then `staging` and `production`).

The step runs in the background with `continue-on-error: true`, so a failed announcement never fails a deploy. If the topic isn't found (e.g. a sandbox or ephemeral environment), the script logs that and exits successfully.

Release announcements and alarms are separate. Alarms go to the alert topic and its own channel (`alerts/slack/channelId`); see [Alarms](./alarms.md#priorities-and-routing).

---

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Commit rejected locally by Husky | Message doesn't match `type(TICKET-REF): subject`; see [Commit message format](#commit-message-format) |
| PR blocked by `Validate PR Title` | Same rule, applied to the PR title. Edit the title; no new commit needed |
| No tag appears after a merge to `main` | Check the `release` job log for a commit-analyzer parse failure |
| `release` job fails | Check the semantic-release log. Deployment to every environment is blocked until it's fixed. `prepareCmd` (changelog generation) failing also fails the release |
| Wrong bump for what you expected to be breaking | Use the type `BREAKING` or `BREAKING CHANGE` exactly; `!` is not supported |
| No Slack message after a deploy | Check the `Announce release` step output, then that `alerts/slack/releaseChannelId` and `workspaceId` are set and the stack was redeployed after setting them |

---

## Related

**Guides:**

- [Deployment Guide](./deployment.md)
- [Configuration](./configuration.md)
- [Alarms](./alarms.md)

**Code:**

- [`.releaserc`](/.releaserc)
- [`scripts/generate-changelog.ts`](/scripts/generate-changelog.ts)
- [`scripts/release-announcement.ts`](/scripts/release-announcement.ts)
- [`scripts/validate-commit-msg.ts`](/scripts/validate-commit-msg.ts)
- [`.github/workflows/main.release.yml`](/.github/workflows/main.release.yml)
- [`.github/workflows/pr.title-validation.yml`](/.github/workflows/pr.title-validation.yml)
