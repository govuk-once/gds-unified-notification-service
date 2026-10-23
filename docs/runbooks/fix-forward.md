# Fix Forward Runbook

How to execute a fix forward during an incident on the GDS Unified Notification Service.

This runbook is for the on-call engineer responding to a live incident under time pressure. Read [When a fix forward is appropriate](#when-a-fix-forward-is-appropriate) first, then follow the numbered steps for the path you choose. You do not need prior incident experience to follow it.

> During an incident the priority is restoring service, not explaining it. Root cause can wait; a stable service cannot.

---

## What a fix forward is

A fix forward is a new, forward change deployed through the normal pipeline to mitigate or resolve a live incident, rather than reverting to an earlier state. In practice this is a small, targeted commit merged to `main` (or, in the most urgent cases, a direct deploy from a workstation) that fixes the fault or removes its impact.

This service deploys forward only — semantic-release tags every push to `main`, and there is no automated "undo". A rollback here is itself a fix forward: a revert commit that produces a new (patch, per the [Releases Guide](../releases.md)) version. The question during an incident is rarely "forward or back" — it's "what is the smallest forward change that restores service".

---

## When a fix forward is appropriate

| Situation | Preferred strategy |
| ---------------------------------------------------------------------------- | ------------------------------------------------ |
| Fault is understood and the fix is small and well scoped | **Fix forward** |
| Fault appeared immediately after a known deploy, previous version was healthy | **Revert (a fix forward)** — a small, low-risk forward change |
| Fault is understood but the fix is large, risky, or touches infrastructure | **Mitigate first** (an SSM config value, a feature toggle), then a considered fix forward |
| Cause is unknown and impact is severe | **Mitigate to stop the bleeding, then investigate** — don't deploy code you don't understand into a live incident |
| Fault is data-related (a bad DynamoDB record, a stuck message) | **Neither** — treat as a data incident, not a deploy problem |

A fix forward is the right call when: you understand what's broken and why the change fixes it; the change is small enough to review in minutes; you can validate the outcome quickly; and a revert would either discard other legitimate changes or no healthy earlier version exists.

---

## Assessing the incident

1. **Confirm the blast radius.** Which routes, queue stages or environments are affected? `dev`/`staging` as well as `production` points to code; `production` only points to configuration, data, scale, or an mTLS/consumer-specific issue.
2. **Fix the timeline.** When did it start? Check the release announcements channel (one `UNS deployed to <env>` message per environment deploy, see [Releases Guide: Deployment notifications](../releases.md#deployment-notifications)), or the Actions tab for the `main.release.yml` or `manual.deploy.yml` run nearest the incident start time, and the git tag it produced.
3. **Identify the suspected version.** Compare the current tag against the last known-healthy one (`git tag --sort=-creatordate | head`).
4. **Check the alarms.** Review which CloudWatch alarms fired (see [Alarms](../alarms.md)) and whether they're still active. If Slack alerting is configured for the environment, check the channel history.
5. **Decide the strategy** using the table above, and say so out loud (or in the incident channel) before touching code.

> If you can't explain in one sentence what's broken and why your change fixes it, you're not ready to deploy. Mitigate first.

---

## Preparing the fix

- Change only what's needed to resolve or mitigate the incident. No unrelated tidy-ups, refactors or dependency bumps riding along.
- Avoid infrastructure (CDK) changes unless the fault is infrastructural. A Lambda code change is far quicker and safer to deploy and reverse.
- Before writing code, check whether a runtime mitigation is enough - i.e. enabling stage's kill switch. Read the side effects in [Configuration: Kill switches](../configuration.md#kill-switches) first, because a disabled stage sends messages to its DLQ.
- Follow the commit convention (see [Releases Guide](../releases.md#commit-message-format)) so the release is versioned correctly: `fix(<TICKET>): <what the fix does>`.
- Get a second engineer to review the diff before it merges, even briefly. The GitHub Environment protection on `staging`/`production` (see [Deployment Guide](../deployment.md#persistent-environments)) means someone approves the deploy regardless, so build the code review in ahead of that, not instead of it.

---

## Deploying the fix

Three paths, from safest to most urgent. Start at the top; only move down if the situation genuinely demands it.

### Path 1: through the standard pipeline (default)

1. Raise the fix as a PR against `main` with a `fix(<TICKET>):` title.
2. Get it reviewed.
3. Merge. [`main.release.yml`](/.github/workflows/main.release.yml) runs semantic-release, then deploys `dev`, then `staging` and `production` in parallel (see [Deployment Guide: Release](../deployment.md#release-mainreleaseyml)). Expect the PR pipeline to take longer than a plain build: it deploys an ephemeral environment and runs e2e and a ZAP scan against it before the PR can merge.
4. Approve the `staging`/`production` Environment gates as they're reached, and watch each environment's post-deploy checks pass before considering that environment done. `dev` runs the full suite plus e2e in CodeBuild, `staging` runs e2e in CodeBuild only, and `production` runs unit tests only (see [Deployment Guide: Reusable deploy workflow](../deployment.md#reusable-deploy-workflow)).

Use this path whenever the incident tolerates the extra minutes a full pipeline run takes.

### Path 2: manual pipeline dispatch (non production only)

If the fix is already merged and you need to redeploy without a new release — the pipeline failed partway, or you need to pick up an SSM-driven config change — trigger [`manual.deploy.yml`](/.github/workflows/manual.deploy.yml) from the Actions tab, selecting whichever of `dev`/`staging` you need. Selected environments deploy independently and in parallel; there's no ordering between them on this path, unlike the automatic release pipeline.

---

## Validating the fix

1. **Confirm the deploy landed:** check the release announcement for the environment, or the stack status in the CloudFormation console (`uns-<env>-stack`, `uns-<env>-alarms-stack`, and `uns-<env>-global-stack` in us-east-1).
2. **Reproduce the original symptom** against the fixed environment and confirm it now behaves.
3. **Check downstream of the change.** A fix to one SQS stage (validation, processing, dispatch, analytics — see [Developer Reference: notification pipeline](../developer-reference.md#notification-pipeline-pso)) can move a problem rather than remove it; check the stages after the one you touched.
4. **Confirm the alarms have cleared** — an alarm still in `ALARM` after the fix means the incident isn't over.

If validation fails, don't layer a second guess on top of the first. Return to assessment, consider a runtime mitigation (an SSM config toggle; see [Developer Reference: Adapters](../developer-reference.md#adapters) and [Configuration](../configuration.md)) to stop the impact, and prepare a corrected fix.

---

## Root cause analysis and follow-up

1. **Reconcile any shortcuts.** If you deployed directly to an environment, land the identical change through `main` before considering the incident closed.
2. **Raise follow-up work** for the root cause investigation and anything the fix forward deferred.
3. **Feed anything you worked out under pressure back into this runbook.**

---

## Related

**Guides:**

- [Deployment Guide](../deployment.md)
- [Releases and Versioning](../releases.md)
- [Infrastructure Development Guide](../infrastructure-development.md)

**Other runbooks:**

- [API Gateway Errors](./api-gateway-errors.md)
- [Queue Backlog and Dispatch Failures](./queue-backlog-and-dispatch-failures.md)

**Workflows:**

- [`main.release.yml`](/.github/workflows/main.release.yml)
- [`_deploy.yml`](/.github/workflows/_deploy.yml)
- [`manual.deploy.yml`](/.github/workflows/manual.deploy.yml)
