#!/usr/bin/env tsx
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Configuration — update JIRA_BASE_URL for your instance
// ---------------------------------------------------------------------------
const REPO_BASE_URL = 'https://github.com/govuk-once/gds-unified-notification-service';
const JIRA_BASE_URL = process.env.JIRA_BASE_URL ?? 'https://gdsgovukagents.atlassian.net/browse';
const OUTPUT_FILE = join(process.cwd(), 'CHANGELOG.md');
const JIRA_PROJECT_KEY = 'NOT';
// Placeholder used for commits that don't warrant a real ticket — treated as untracked
const JIRA_PLACEHOLDER = 'NOT-000';

const SUMMARIES_FILE = join(process.cwd(), 'scripts/changelog-summaries.json');
const summaries: Record<string, string> = existsSync(SUMMARIES_FILE)
  ? (JSON.parse(readFileSync(SUMMARIES_FILE, 'utf-8')) as Record<string, string>)
  : {};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TagInfo {
  name: string;
  date: string; // ISO date YYYY-MM-DD
  isoWeek: string; // YYYY-WNN
}

interface Commit {
  hash: string;
  type: string | null;
  jiraTickets: string[];
  subject: string;
  prNumber: number | null;
  breaking: boolean;
}

interface TicketGroup {
  ticketId: string | null; // null = no JIRA ticket
  commits: Commit[];
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------
function exec(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8' }).trim();
}

function getTags(): TagInfo[] {
  const raw = exec("git tag --sort=-creatordate --format='%(creatordate:short)|%(refname:short)'");
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [date, name] = line.split('|');
      return { name, date, isoWeek: toIsoWeek(date) };
    });
}

function getCommitsBetweenTags(olderTag: string, newerTag: string): Commit[] {
  const raw = exec(`git log ${olderTag}...${newerTag} --oneline`);
  return raw
    .split('\n')
    .filter(Boolean)
    .map(parseCommit)
    .filter((c) => !isReleaseCommit(c));
}

function getCommitsUpToTag(tag: string): Commit[] {
  const raw = exec(`git log ${tag} --oneline`);
  return raw
    .split('\n')
    .filter(Boolean)
    .map(parseCommit)
    .filter((c) => !isReleaseCommit(c));
}

// ---------------------------------------------------------------------------
// Commit parsing
// ---------------------------------------------------------------------------
const CONVENTIONAL_RE = /^([a-zA-Z]+)(?:\([^)]+\))?\s*(!)?:\s*(.+)$/;
const PR_RE = /\s*\(#(\d+)\)\s*$/;
const JIRA_RE = new RegExp(`${JIRA_PROJECT_KEY}-\\d+`, 'g');

function parseCommit(line: string): Commit {
  const spaceIdx = line.indexOf(' ');
  const hash = line.slice(0, spaceIdx);
  const message = line.slice(spaceIdx + 1);

  const prMatch = message.match(PR_RE);
  const prNumber = prMatch ? parseInt(prMatch[1], 10) : null;
  const messageWithoutPr = prMatch ? message.slice(0, message.lastIndexOf(prMatch[0])).trim() : message;

  const jiraTickets = [...new Set([...messageWithoutPr.matchAll(JIRA_RE)].map((m) => m[0]))];

  const conventionalMatch = messageWithoutPr.match(CONVENTIONAL_RE);
  if (conventionalMatch) {
    const [, type, bang, subject] = conventionalMatch;
    const breaking = type.toUpperCase() === 'BREAKING' || !!bang;
    return { hash, type: type.toLowerCase(), jiraTickets, subject, prNumber, breaking };
  }

  return { hash, type: null, jiraTickets, subject: messageWithoutPr, prNumber, breaking: false };
}

function isReleaseCommit(c: Commit): boolean {
  return c.type === 'chore' && /^v\d+\.\d+\.\d+/.test(c.subject);
}

// ---------------------------------------------------------------------------
// ISO week calculation
// ---------------------------------------------------------------------------
function toIsoWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`); // noon UTC avoids DST edge cases
  const dayOfWeek = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() - dayOfWeek + 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function weekLabel(isoWeek: string): string {
  const [year, w] = isoWeek.split('-W');
  return `Week ${parseInt(w, 10)}, ${year}`;
}

// ---------------------------------------------------------------------------
// Grouping helpers
// ---------------------------------------------------------------------------
const TYPE_ORDER = [
  'breaking',
  'feat',
  'fix',
  'perf',
  'refactor',
  'docs',
  'test',
  'build',
  'chore',
  'ci',
  'style',
  'revert',
];
const TYPE_LABELS: Record<string, string> = {
  breaking: 'Breaking Changes',
  feat: 'Features',
  fix: 'Bug Fixes',
  perf: 'Performance',
  refactor: 'Refactoring',
  docs: 'Documentation',
  test: 'Tests',
  build: 'Internal',
  chore: 'Internal',
  ci: 'Internal',
  style: 'Style',
  revert: 'Reverts',
};

function groupByType(commits: Commit[]): Map<string, Commit[]> {
  const grouped = new Map<string, Commit[]>();
  for (const c of commits) {
    const key = c.breaking ? 'breaking' : (c.type ?? 'other');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(c);
  }
  return grouped;
}

function groupByTicket(commits: Commit[]): TicketGroup[] {
  const byTicket = new Map<string, Commit[]>();
  for (const c of commits) {
    const ticket = c.jiraTickets[0];
    const key = !ticket || ticket === JIRA_PLACEHOLDER ? '__none__' : ticket;
    if (!byTicket.has(key)) byTicket.set(key, []);
    byTicket.get(key)!.push(c);
  }

  // Tickets sorted numerically, no-ticket entries at the end
  const sortedKeys = [...byTicket.keys()].sort((a, b) => {
    if (a === '__none__') return 1;
    if (b === '__none__') return -1;
    return parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10);
  });

  return sortedKeys.map((key) => ({
    ticketId: key === '__none__' ? null : key,
    commits: byTicket.get(key)!,
  }));
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------
function prLink(prNumber: number): string {
  return `[#${prNumber}](${REPO_BASE_URL}/pull/${prNumber})`;
}

function ticketLink(ticketId: string): string {
  return `[${ticketId}](${JIRA_BASE_URL}/${ticketId})`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function renderTicketGroup(group: TicketGroup): string {
  const { ticketId, commits } = group;
  const label = ticketId ? ticketLink(ticketId) : null;

  if (commits.length === 1) {
    const c = commits[0];
    const pr = c.prNumber ? ` (${prLink(c.prNumber)})` : '';
    return `- ${label ? `${label} ` : ''}${capitalize(c.subject)}${pr}`;
  }

  // Multiple PRs for the same ticket: ticket as parent, each commit as subitem
  const header = `- ${label ?? 'Other'}`;
  const children = commits.map((c) => {
    const pr = c.prNumber ? ` (${prLink(c.prNumber)})` : '';
    return `  - ${capitalize(c.subject)}${pr}`;
  });
  return [header, ...children].join('\n');
}

function renderWeekSection(
  isoWeek: string,
  weekTags: TagInfo[],
  fromTag: TagInfo | undefined,
  allCommits: Commit[]
): string {
  if (allCommits.length === 0) return '';

  const dates = weekTags.map((t) => t.date).sort();
  const dateRange = dates.length === 1 ? dates[0] : `${dates[0]} – ${dates[dates.length - 1]}`;

  // weekTags is newest-first
  const newestTag = weekTags[0].name;
  const oldestTag = weekTags[weekTags.length - 1].name;
  const compareFrom = weekTags.length > 1 ? oldestTag : fromTag?.name;

  const versionSpan = compareFrom
    ? `[${compareFrom === oldestTag ? oldestTag : compareFrom} → ${newestTag}](${REPO_BASE_URL}/compare/${compareFrom}...${newestTag})`
    : newestTag;

  const heading = `## ${weekLabel(isoWeek)}`;
  const meta = `${dateRange} · ${versionSpan}`;

  const byType = groupByType(allCommits);
  const sortedTypes = [...byType.keys()].sort((a, b) => {
    const ai = TYPE_ORDER.indexOf(a);
    const bi = TYPE_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const summary = summaries[isoWeek];
  const lines: string[] = summary ? [heading, '', meta, '', summary] : [heading, '', meta];

  for (const type of sortedTypes) {
    const label = TYPE_LABELS[type] ?? 'Other';
    lines.push('');
    lines.push(`### ${label}`);
    for (const group of groupByTicket(byType.get(type)!)) {
      lines.push(renderTicketGroup(group));
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function generate(): string {
  const tags = getTags();
  if (tags.length === 0) return '# Changelog\n\n_No releases found._\n';

  // Resolve commits per tag (delta between consecutive releases)
  const commitsByTag = new Map<string, Commit[]>();
  for (let i = 0; i < tags.length; i++) {
    const older = tags[i + 1];
    commitsByTag.set(
      tags[i].name,
      older ? getCommitsBetweenTags(older.name, tags[i].name) : getCommitsUpToTag(tags[i].name)
    );
  }

  // Group tags by ISO week (newest first)
  const byWeek = new Map<string, TagInfo[]>();
  for (const tag of tags) {
    if (!byWeek.has(tag.isoWeek)) byWeek.set(tag.isoWeek, []);
    byWeek.get(tag.isoWeek)!.push(tag);
  }
  const weeks = [...byWeek.keys()].sort((a, b) => b.localeCompare(a));

  const out: string[] = ['# Changelog', '', `_Generated on ${new Date().toISOString().slice(0, 10)}_`];

  for (let wi = 0; wi < weeks.length; wi++) {
    const week = weeks[wi];
    const weekTags = byWeek.get(week)!;
    const allCommits = weekTags.flatMap((t) => commitsByTag.get(t.name) ?? []);
    // Tag immediately before the oldest in this week — used for compare links
    const oldestInWeek = weekTags[weekTags.length - 1];
    const oldestIdx = tags.findIndex((t) => t.name === oldestInWeek.name);
    const fromTag = tags[oldestIdx + 1];
    const section = renderWeekSection(week, weekTags, fromTag, allCommits);
    if (section) {
      out.push('');
      out.push(section);
    }
  }

  return out.join('\n');
}

const changelog = generate();
writeFileSync(OUTPUT_FILE, changelog, 'utf-8');
console.log(`Changelog written to ${OUTPUT_FILE}`);
