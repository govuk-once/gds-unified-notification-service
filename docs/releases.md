# Releases and Versioning

How release versions are computed and how they flow into a deploy. Releases are fully automated with [semantic-release](https://github.com/semantic-release/semantic-release) — no manual tagging is expected or required.

---

## How versioning is determined

On every push to `main`, the `release` job in [`main.release.yml`](/.github/workflows/main.release.yml) runs `pnpm run semantic:release` (`semantic-release`) before anything is deployed. It reads [`.releaserc`](/.releaserc) and analyses every commit since the last release tag using the Angular commit-analyzer preset, with these release rules:

| Commit type in the squashed message                 | Version bump    | Example                              |
| ------------------------------------------------------- | ------------------ | ---------------------------------------- |
| `BREAKING` or `BREAKING CHANGE`                          | Major (`2.0.0`)     | `BREAKING CHANGE(NOT-789): drop legacy field` |
| `feat`                                                    | Minor (`1.2.0`)     | `feat(NOT-123): add preferences endpoint`  |
| Anything else (`fix`, `chore`, `docs`, `refactor`, `style`, `test`, `build`, `ci`, `revert`, …) | Patch (`1.1.1`) | `fix(NOT-456): handle empty payload`       |

> Every commit type other than `feat` and a breaking change bumps **patch** — the `.releaserc` rules are `{ type: '*', release: 'patch' }` and a `{ message: '*', release: 'patch' }` fallback, not just `fix`. A `chore` or `docs` commit still cuts a patch release.

When the analysed commits warrant a release, semantic-release:

1. Computes the next version and creates and pushes the git tag `v<version>` — this is core semantic-release behaviour, done regardless of which plugins are configured, since it's how the next run knows where the last release left off.
2. Writes the version to `$GITHUB_OUTPUT` (`semVer=<version>`), exposed as `steps.release.outputs.semVer` for the deploy jobs that follow.

When no commit since the last tag warrants a release, no tag is created and the pipeline continues straight to deployment — a `main` push with no releasable commits (e.g. only a `docs:`-scoped… actually even `docs:` bumps patch per the table above, so in practice almost any commit releases; this only skips on commits the analyser can't parse at all).

A git tag existing means the code is merged and versioned. It does **not** mean the code has reached production — see [Deployment Guide: deployment flow](./deployment.md#deployment-flow) for how `dev`, `staging` and `production` deploy after the release step.

---

## What semantic-release does *not* do here

[`.releaserc`](/.releaserc) configures exactly three plugins — `@semantic-release/commit-analyzer`, `@semantic-release/npm` (with `npmPublish: false`), `@semantic-release/exec` (only to write `$GITHUB_OUTPUT`). Worth knowing what's absent, since sibling projects sometimes configure more:

- **No `@semantic-release/changelog`** — no `CHANGELOG.md` is generated or committed. The git tags and (see below) squashed commit history are the record.
- **No `@semantic-release/git`** — the version bump `@semantic-release/npm` writes to `package.json` during the CI run is never committed back to the repository. This is why [`package.json`](/package.json)'s `version` field reads `"0.0.0"` in the working tree — that's expected, not stale; the real version lives in the git tags, not the file.
- **No `@semantic-release/github`** — semantic-release itself does not create a GitHub Release object (the entry that shows up on the repository's *Releases* page). Only the underlying git tag is created and pushed. If you're looking for release notes, use the tag list or the squashed commit history on `main`, not the Releases tab.
- **No npm publish** — `npmPublish: false` means `@semantic-release/npm` is used purely for its version-computation side effect; nothing is published to any npm registry.

---

## Commit message format

PRs are squash-merged, so the PR title becomes the commit on `main` and is what the commit analyser reads. Commit messages are enforced locally by Husky's `commit-msg` hook plus [`commitlint.config.ts`](/commitlint.config.ts) (extends `@commitlint/config-angular`):

```text
<type>(<TICKET-REF>): <description>
```

- **Type** must be one of: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`, or `BREAKING CHANGE`/`BREAKING`.
- **Scope is mandatory**, must be **upper-case**, and must match a ticket reference pattern — 1–6 uppercase letters, a hyphen, 1–5 digits (`NOT-434`, `JIRA-1`, up to `ABCDEF-12345`).
- **Subject** must not be empty; case is unrestricted.

```text
feat(NOT-111): added unit tests
fix(ABC-321): increased font size
chore(JIRA-456): added endpoint
BREAKING CHANGE(JIRA-456): removed an endpoint
```

Full detail (including how the pre-commit hooks interact with this) is in [`.husky/README.md`](/.husky/README.md). Dependabot PR titles (`fix(deps): bump the dependencies group` style) aren't ticket-scoped and are exempt in practice since Dependabot doesn't go through the local Husky hook — they're parsed by the commit analyser as ordinary conventional commits when they land on `main`.

---

## Deployment notifications

Unlike some sibling GOV.UK Once projects, **this repository has no Slack or SNS release-notification step.** A repo-wide search of every workflow file for `sns`, `slack` and `chatbot` turns up nothing in the release or deploy pipeline. If you want to know a release has shipped, check:

- The git tag on `main` (`git tag --sort=-creatordate | head`) or the pipeline run itself in the Actions tab.
- `#govuk-once-flex-release`-style channels don't exist for this project — alarms do reach Slack (see [Infrastructure Development Guide: Alerting](./infrastructure-development.md#alerting)), but that's operational alerting via AWS Chatbot on CloudWatch alarms, not a "here's what just deployed" announcement.

If a deployment announcement is something the team wants, it doesn't exist yet — it would need to be built, not just enabled.

---

## Troubleshooting

| Symptom                                       | Likely cause                                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Commit rejected locally by Husky                 | Message doesn't match `type(TICKET-REF): subject` — see [Commit message format](#commit-message-format) |
| No tag appears after a merge to `main`             | Extremely unusual given almost every type bumps at least a patch — check the `release` job log for a commit-analyzer parse failure |
| `release` job fails                                | Check the semantic-release log in the job output; deployment to `dev`/`staging`/`production` is blocked until it's fixed |
| Wrong bump for what you expected to be breaking     | Ensure the type is exactly `BREAKING` or `BREAKING CHANGE` (case-sensitive, matching the `.releaserc` rule) — `feat!:`-style bang syntax is **not** configured as a breaking-change trigger here, unlike some Angular-preset setups |
| Looking for a changelog or GitHub Release entry      | Neither exists — see [What semantic-release does not do here](#what-semantic-release-does-not-do-here) |

---

## Related

**Guides:**

- [Deployment Guide](./deployment.md)
- [Infrastructure Development Guide: Alerting](./infrastructure-development.md#alerting)

**Code:**

- [`.releaserc`](/.releaserc)
- [`commitlint.config.ts`](/commitlint.config.ts)
- [`.husky/README.md`](/.husky/README.md)
- [`.github/workflows/main.release.yml`](/.github/workflows/main.release.yml)
