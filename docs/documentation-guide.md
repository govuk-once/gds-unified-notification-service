# Documentation Guide

Standards for writing documentation in this repository.

---

## Principles

1. **Keep READMEs lean**: summarise what something does and link to a deeper guide rather than repeating it.
2. **Use plain English**: avoid jargon, define acronyms (PSO, mTLS, IoC) on first use in a document.
3. **Show, don't tell**: prefer a real code snippet with a real file path over a lengthy prose description.
4. **Be consistent**: follow the templates below rather than inventing a new structure per document.

### Code block conventions

- Always include a language identifier (`typescript`, `bash`, `json`, `yaml`, `text`).
- Use `text` for directory trees and CLI output.
- Prefer real snippets copied from the repository (with a `View` link) over invented examples. If a snippet is illustrative rather than real code, say so.

### Formatting

- Use `---` dividers between major sections.
- Use tables for structured, scannable data (environment variables, alarm thresholds, commands).
- Use blockquotes (`>`) for asides and warnings that would otherwise interrupt the main flow.
- Use **bold** sparingly, for genuinely load-bearing terms.
- Prefer sentences over bullet points in prose; reserve bullets for genuinely parallel items.

---

## Where documentation lives

This is a single-package repository (one `package.json`, one CDK app), not a monorepo, so there is no `libs/*` or `domains/*` split to document per-package. Instead:

| Content type | Location |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| Cross-cutting guides, architecture, runbooks | [`docs/*.md`](.) |
| Operational runbooks | [`docs/runbooks/*.md`](./runbooks/README.md) |
| Conventions for a specific directory (naming, test setup) | `README.md` colocated in that directory |
| Published OpenAPI reference (PSO and Flex) | [`docs/pso/openapi.yml`](./pso/openapi.yml), [`docs/flex/openapi.yml`](./flex/openapi.yml) — published to GitHub Pages by [`main.pages.yml`](/.github/workflows/main.pages.yml) |
| CI/CD pipeline behaviour | [`.github/README-Pipelines.md`](/.github/README-Pipelines.md) |
| Git hook / commit convention behaviour | [`.husky/README.md`](/.husky/README.md) |

Existing colocated READMEs worth knowing about before you add a new one:

| File | Covers |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| [`src/README.md`](/src/README.md) | Unit testing conventions (file naming, mocking, coverage gate) |
| [`src/lambdas/README.md`](/src/lambdas/README.md) | Lambda directory/naming conventions (`{trigger}.{operationName}`) |
| `src/lambdas/**/README.md` | Per-Lambda documentation (sample event, infrastructure touched, request-flow diagram) — one per Lambda directory |
| [`src/common/operations/README.md`](/src/common/operations/README.md) | The base operation classes handlers extend, in more depth than the [Developer Reference](./developer-reference.md#handler-patterns) covers |
| [`src/common/services/README.md`](/src/common/services/README.md) | The IoC container and every service class, in more depth than the [Developer Reference](./developer-reference.md#services-and-adapters) covers |
| [`test/e2e/README.md`](/test/e2e/README.md) | End-to-end testing conventions against deployed environments |
| [`.husky/README.md`](/.husky/README.md) | Pre-commit hooks and commit message format |
| [`.github/README-Pipelines.md`](/.github/README-Pipelines.md) | Step-by-step breakdown of every GitHub Actions workflow |

Don't duplicate any of the above into a `docs/*.md` guide — link to it instead. A `docs/*.md` guide should explain the *why* and the *how it fits together*; a colocated `README.md` should explain the *conventions for files in this directory*. If you're deep in one directory's neighbourhood, check for a colocated `README.md` first; if you're trying to understand how the system fits together, start with `docs/`.

---

## Templates

### A new `docs/*.md` guide

```markdown
# <Guide Title>

One sentence describing what this guide covers and who it's for.

---

## Overview

A short table or paragraph orienting the reader before the detail.

---

## <Main section(s)>

The substance of the guide, grounded in real file paths and real code.

---

## Related

**Guides:**

- [Other Guide](/docs/other-guide.md)

**Code:**

- [`path/to/relevant/code`](/path/to/relevant/code)
```

### A colocated directory `README.md`

Used for conventions specific to files that live in one directory (see the table above for existing examples). Keep these short — a page, not a guide. State the convention, give one real example, and link out to a `docs/*.md` guide for anything that needs more explanation.

### A runbook

See [`docs/runbooks/README.md`](./runbooks/README.md) for the runbook template and index.

---

## Related

**The GDS Way:**

- [README Guidance](https://gds-way.digital.cabinet-office.gov.uk/manuals/readme-guidance.html)
- [Writing for GOV.UK](https://www.gov.uk/guidance/content-design/writing-for-gov-uk)
