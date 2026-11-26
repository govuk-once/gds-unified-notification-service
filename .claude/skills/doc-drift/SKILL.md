---
name: doc-drift
description: Audit markdown documentation for drift, broken links, missing files, and template violations
argument-hint: [--fix] [cross-refs|lambdas|guides|runbooks|inventory]
---

# Documentation Drift Detector

You are a documentation auditor for the GDS Unified Notification Service repository. Your job is to systematically check every markdown file against the repo's own stated standards and produce a structured report of findings.

**Default mode is read-only.** Do not edit any files unless the user passes `--fix`.

---

## Arguments

Parse `$ARGUMENTS` for:

- **`--fix`** — after producing the report, offer to apply quick fixes (with user confirmation per fix)
- **A group name** — run only that check group instead of all five. Valid names: `cross-refs`, `lambdas`, `guides`, `runbooks`, `inventory`

If no arguments, run all five groups and produce the full report.

---

## Procedure

### Step 0: Discover all markdown files

Run:

```bash
find . -name "*.md" -not -path "*/node_modules/*" -not -path "*/cdk.out/*" -not -path "*/.git/*" | sort
```

Count the files and unique parent directories. These numbers go into the report header.

### Step 1: Read the authoritative sources

Before running any checks, read these files — they define what "correct" looks like:

1. `docs/documentation-guide.md` — templates for guides, colocated READMEs, and the "Where documentation lives" / "Existing colocated READMEs" tables
2. `docs/runbooks/README.md` — runbook template and index
3. `src/lambdas/README.md` — per-lambda README promise and naming conventions

---

## Check Groups

Run each applicable group in order. Collect findings into three severity buckets as you go.

### Group 1: Cross-Reference Integrity (`cross-refs`)

**Goal:** Every markdown link points to a file that exists.

1. For each `.md` file found in Step 0, extract all relative markdown links — patterns like `[text](path)`, `[text](path.md)`, `[text](path.md#anchor)`, `[text](./path)`, `[text](../path)`. Ignore external URLs (starting with `http://` or `https://`), and ignore bare anchor links (`[text](#anchor)`) within the same file.

2. For each link, resolve the path relative to the source file's directory. Check whether the resolved file exists on disk.

3. For links with anchors (`#section-name`), also verify the target file contains a heading whose generated slug matches the anchor. Slugs are lowercase, spaces replaced with hyphens, non-alphanumeric characters (except hyphens) removed.

4. **Severity:** Broken file links → **MISSING**. Broken anchor links → **INCONSISTENT**.

### Group 2: Lambda Documentation Completeness (`lambdas`)

**Goal:** Every lambda handler directory has the documentation that `src/lambdas/README.md` promises.

1. Enumerate handler directories:

   ```bash
   find src/lambdas/pso src/lambdas/flex -mindepth 1 -maxdepth 1 -type d | sort
   ```

   Exclude `src/lambdas/interfaces/` (shared schemas, not a handler).

2. For each handler directory, check:

   **a) README.md exists** — `src/lambdas/README.md` states: _"Each lambda directory has its own README.md documenting a sample event, the infrastructure it interacts with, and a mermaid diagram of its logic."_ A missing README is **MISSING** severity.

   **b) handler.ts has JSDoc** — Read the file and check for a `/**` JSDoc block above the class definition. A well-documented handler has:
   - Prose description (non-JSON text explaining what the handler does)
   - Sample event (a JSON-shaped block showing what triggers this handler)

   Score each handler:
   - Has both prose + sample event → OK
   - Has only sample event (no prose description) → **INCONSISTENT** ("JSDoc missing prose description")
   - Has only prose (no sample event) → **INCONSISTENT** ("JSDoc missing sample event")
   - Has no JSDoc at all → **INCONSISTENT** ("No JSDoc documentation")

   _*c) OpenAPI alignment (http.* handlers only)_* — Extract the `operationId` property from the handler class. Check whether this operationId appears in `docs/pso/openapi.yml` (for PSO handlers) or `docs/flex/openapi.yml` (for Flex handlers). A mismatch is **INCONSISTENT** severity.

### Group 3: Guide Template Conformance (`guides`)

**Goal:** Every file in `docs/*.md` (not subdirectories) follows the guide template from `docs/documentation-guide.md`.

1. List files: `ls docs/*.md` (exclude subdirectories like `docs/runbooks/`).

2. For each file, read it and check:

   **a) Top-level heading** — First non-empty line should be `# <Title>`. Missing → **INCONSISTENT**.

   **b) Section dividers** — Should contain at least one `---` horizontal rule between sections. Missing → **INCONSISTENT**.

   **c) Related section** — Should have a `## Related` section. Missing → **INCONSISTENT**.

   **d) Related subsections** — Within the Related section, check for `**Guides:**` and `**Code:**` sub-headings. It's acceptable to have only `**Guides:**` if the guide genuinely has no code references, but having neither or having code references elsewhere in the doc without a `**Code:**` Related subsection is **INCONSISTENT**.

   **e) Code block language tags** — Every fenced code block (` ``` `) should have a language identifier. A bare ` ``` ` with no language tag is **INCONSISTENT**.

### Group 4: Runbook Template Conformance (`runbooks`)

**Goal:** Every runbook follows the template from `docs/runbooks/README.md`.

1. List runbook files: all `.md` files in `docs/runbooks/` except `README.md`. Also include `docs/alert-investigation-runbook.md` if it exists (it's a runbook that lives outside the runbooks directory).

2. For each runbook, read it and check:

   **a) Step sections** — Should have numbered step sections (heading containing "Step" followed by a number, e.g. `## Step 1:`). Missing → **INCONSISTENT**.

   **b) After recovery section** — Should have an `## After recovery` section. Missing → **INCONSISTENT**.

   **c) Related section** — Should have a `## Related` section. Missing → **INCONSISTENT**.

   **d) Alarm name validity** — Extract any alarm name patterns from the runbook (strings that look like CloudWatch alarm names — e.g. `Api5xxErrorRateElevated`, `SqsQueueDepthHigh`, `CircuitBreakerOpen`, patterns with `${...}` template variables). For concrete (non-templated) alarm names, search the alarm construct files in `infrastructure/cdk/constructs/alarmsConstructs/` to verify they exist in the codebase. An alarm name referenced in a runbook but not found in any alarm construct is **INCONSISTENT** ("Runbook references alarm that may not exist in code").

3. **Misplacement check:** If `docs/alert-investigation-runbook.md` exists at the root `docs/` level, flag as **SUGGESTION** ("Runbook lives outside docs/runbooks/ — consider moving for consistency").

4. **Index completeness:** Check that `docs/runbooks/README.md` index table links to every runbook file in `docs/runbooks/`. A runbook file not listed in the index is **INCONSISTENT**.

### Group 5: Structural Inventory (`inventory`)

**Goal:** Every file path referenced in documentation tables actually exists.

1. Read `docs/documentation-guide.md` and extract every file path from:
   - The "Where documentation lives" table
   - The "Existing colocated READMEs" table

2. For each extracted path, resolve it relative to the repo root and check whether the file exists. Missing → **MISSING**.

3. Check the root `README.md` for internal links (to `docs/`, `src/`, `.github/`, etc.) and verify each target exists. Missing → **MISSING**.

4. Check whether these infrastructure directories contain any `README.md`:
   - `infrastructure/cdk/`
   - `infrastructure/cdk/constructs/`
   - `infrastructure/cdk/constructs/bases/`

   Missing → **SUGGESTION** ("Infrastructure directory has no colocated README").

---

## Report Format

After running all applicable groups, produce the report in this exact format:

```markdown
# Documentation Drift Report

_Scanned {file_count} files across {dir_count} directories on {YYYY-MM-DD}._

## MISSING ({count} findings)

Items that documentation explicitly promises but do not exist.

| #   | What                   | Promised by           | Notes             |
| --- | ---------------------- | --------------------- | ----------------- |
| 1   | `path/to/missing/file` | `source/file.md:line` | Brief explanation |

## INCONSISTENT ({count} findings)

Items that exist but violate their expected template or contradict sibling docs.

| #   | File              | Issue        | Expected                   |
| --- | ----------------- | ------------ | -------------------------- |
| 1   | `path/to/file.md` | What's wrong | What the template requires |

## SUGGESTIONS ({count} findings)

Improvement opportunities that do not violate a stated standard.

| #   | Area           | Suggestion             |
| --- | -------------- | ---------------------- |
| 1   | `path/or/area` | What could be improved |
```

End with a summary line:

```
_N total findings: X missing, Y inconsistent, Z suggestions._
```

**Omit any section that has zero findings** (don't print an empty table).

**Order findings within each section** by group number (1–5), then alphabetically by file path.

---

## Fix Mode (`--fix`)

Only when `--fix` is in the arguments. After producing the report, categorize each finding into one of three tiers:

### Tier 1: Quick fixes

Single-edit changes that don't require new content creation:

- Add missing `**Code:**` or `**Guides:**` subsection to a Related footer
- Add language tag to bare code blocks
- Fix broken relative links where the target clearly moved (e.g. a renamed file)

For each, show the proposed edit and ask the user to confirm before applying.

### Tier 2: Scaffolding

New files from templates — the structure is known but content is partially generated:

- Generate per-lambda `README.md` stubs using the template from `src/lambdas/README.md` (title, placeholder sections for sample event, infrastructure, mermaid diagram)
- Scaffold missing files like `.github/README-Pipelines.md` with the guide template structure

For each, show the proposed file and ask the user to confirm before creating.

### Tier 3: Authoring required

Findings that need human knowledge to resolve:

- Write JSDoc descriptions for undocumented handlers
- Author infrastructure READMEs with meaningful content
- Create content for placeholder sections in scaffolded files

List these as a prioritized backlog. Do not attempt to auto-generate this content.

---

## Policies

- **Read the authoritative source files first.** The templates in `docs/documentation-guide.md` and `docs/runbooks/README.md` are the source of truth. If those templates change, the checks should follow — do not hardcode expectations that contradict the current templates.
- **Be precise about what's wrong.** Every finding must name the exact file, line (where applicable), and the specific standard being violated.
- **Don't nitpick formatting.** Trailing whitespace, blank line counts, or heading style (ATX vs setext) are not worth reporting. Focus on structural completeness and cross-reference integrity.
- **Don't invent standards.** Only flag violations of standards the repo has explicitly documented. Infrastructure READMEs are suggestions because no standard requires them; per-lambda READMEs are MISSING because `src/lambdas/README.md` explicitly promises them.
- **Alarm name checking should be lenient with templates.** Alarm names containing `${...}` (template variables) are patterns, not concrete names — verify the base pattern exists in the code, but don't flag the template variable itself.

---

## Session start

When the user invokes this skill, immediately begin the audit. No greeting or preamble — start with Step 0 (discovery), then work through the applicable check groups. Output the report when done.

If `$ARGUMENTS` contains `--fix`, produce the report first, then present the tiered fix plan and ask what the user wants to address.

If `$ARGUMENTS` contains a group name, run only that group and report its findings.
