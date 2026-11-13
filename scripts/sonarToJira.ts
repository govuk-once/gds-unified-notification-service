// cspell:words Bramwell customfield quot apos remediat issuetype duedate
import { createHash } from 'node:crypto';

type SonarSeverity = 'BLOCKER' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

type SonarLocation = {
  component?: string;
  textRange?: {
    startLine?: number;
  };
  msg?: string;
};

type SonarFlow = {
  locations?: SonarLocation[];
};

type SonarIssue = {
  key: string;
  message: string;
  component: string;
  line?: number;
  rule?: string;
  creationDate?: string;
  impacts?: {
    softwareQuality: string;
    severity: string;
  }[];
  flows?: SonarFlow[];
};

type SonarSearch = {
  total: number;
  issues: SonarIssue[];
};

type RuleSection = {
  key?: string;
  content?: string;
  htmlContent?: string;
};

type RuleDetails = {
  rule?: {
    name?: string;
    descriptionSections?: RuleSection[];
  };
};

type JiraSearch = {
  issues: {
    key: string;
    fields?: {
      labels?: string[];
    };
  }[];
  nextPageToken?: string;
};

type JiraUser = {
  accountId: string;
  displayName?: string;
  active?: boolean;
  accountType?: string;
};

type JiraCreated = {
  key: string;
};

type AdfNode = Record<string, unknown>;

type SeverityMapping = {
  label: string;
  optionId: string;
  priorityId: string;
};

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const sonarUrl = required('SONAR_URL').replace(/\/$/, '');
const sonarToken = required('SONAR_TOKEN_UNS');

const jiraUrl = required('JIRA_URL').replace(/\/$/, '');
const jiraEmail = required('JIRA_EMAIL');
const jiraToken = required('JIRA_API_TOKEN');

const organization = 'govuk-once';
const sonarProject = 'govuk-once_gds-unified-notification-service';
const jiraProject = 'GUV';

const dryRun = process.env.DRY_RUN !== 'false';
const maxTickets = 5;

const jiraEnvironment = 'Staging';
const stakeholderName = 'Joseph Bramwell';

const stakeholderAccountIdOverride = process.env.JIRA_STAKEHOLDER_ACCOUNT_ID?.trim();

const jiraFields = {
  source: 'customfield_10545',
  severity: 'customfield_10546',
  stakeholders: 'customfield_10547',
  impact: 'customfield_10004',
  cvss: 'customfield_10512',
  epss: 'customfield_10479',
  exceptionReviewDate: 'customfield_10580',
  environment: 'environment',
} as const;

const severityMappings: Record<SonarSeverity, SeverityMapping> = {
  BLOCKER: {
    label: 'Critical',
    optionId: '10138',
    priorityId: '1',
  },
  HIGH: {
    label: 'High',
    optionId: '10137',
    priorityId: '2',
  },
  MEDIUM: {
    label: 'Medium',
    optionId: '10136',
    priorityId: '3',
  },
  LOW: {
    label: 'Low',
    optionId: '10135',
    priorityId: '4',
  },
  INFO: {
    label: 'Informational',
    optionId: '10134',
    priorityId: '5',
  },
};

const severityOrder: SonarSeverity[] = ['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

// Calendar-day remediation defaults from VM guidance.
const remediationDays: Partial<Record<SonarSeverity, number>> = {
  BLOCKER: 2,
  HIGH: 7,
  MEDIUM: 15,
  LOW: 30,
};

const jiraAuth = Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64');

function calculateDueDate(severity: SonarSeverity, detectionDate?: string): string | undefined {
  const days = remediationDays[severity];

  if (days === undefined) {
    return undefined;
  }

  const detected = detectionDate ? new Date(detectionDate) : new Date();

  if (Number.isNaN(detected.getTime())) {
    throw new Error(`Invalid SonarCloud detection date: ${String(detectionDate)}`);
  }

  const due = new Date(detected);

  due.setUTCDate(due.getUTCDate() + days);

  return due.toISOString().slice(0, 10);
}

function validateExecution(): void {
  if (process.env.GITHUB_ACTIONS !== 'true') {
    return;
  }

  const isMainPush = process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_REF === 'refs/heads/main';

  if (!isMainPush) {
    throw new Error('Jira integration must run on a push to main');
  }
}

async function sonarGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(path, `${sonarUrl}/`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${sonarToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`SonarCloud ${path} HTTP ${String(response.status)}: ${await response.text()}`);
  }

  return (await response.json()) as T;
}

async function jiraRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);

  headers.set('Authorization', `Basic ${jiraAuth}`);
  headers.set('Accept', 'application/json');
  headers.set('Content-Type', 'application/json');

  const response = await fetch(`${jiraUrl}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`Jira HTTP ${String(response.status)}: ${await response.text()}`);
  }

  return response;
}

async function resolveStakeholderAccountId(): Promise<string> {
  if (stakeholderAccountIdOverride) {
    console.log('Using configured Jira stakeholder account ID');

    return stakeholderAccountIdOverride;
  }

  const url = new URL('/rest/api/3/user/search', `${jiraUrl}/`);

  url.searchParams.set('query', stakeholderName);

  url.searchParams.set('maxResults', '100');

  const response = await jiraRequest(`${url.pathname}${url.search}`);

  const users = (await response.json()) as JiraUser[];

  const matches = users.filter(
    (user) =>
      user.displayName?.trim().toLowerCase() === stakeholderName.toLowerCase() &&
      user.active !== false &&
      user.accountType !== 'app'
  );

  if (matches.length === 0) {
    throw new Error(
      `Could not resolve Jira stakeholder "${stakeholderName}". ` +
        'Check Jira user-search permissions or configure ' +
        'JIRA_STAKEHOLDER_ACCOUNT_ID.'
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `Multiple Jira users match "${stakeholderName}". ` +
        'Configure JIRA_STAKEHOLDER_ACCOUNT_ID to select the correct account.'
    );
  }

  const accountId = matches[0]?.accountId;

  if (!accountId) {
    throw new Error(`Jira did not return an account ID for ${stakeholderName}`);
  }

  console.log(`Resolved Jira stakeholder: ${stakeholderName}`);

  return accountId;
}

async function getFindings(): Promise<SonarIssue[]> {
  const findings: SonarIssue[] = [];

  let page = 1;
  let more = true;

  while (more) {
    const data = await sonarGet<SonarSearch>('/api/issues/search', {
      organization,
      componentKeys: sonarProject,
      impactSoftwareQualities: 'SECURITY',
      impactSeverities: 'HIGH,BLOCKER',
      branch: 'main',
      ps: '100',
      p: String(page),
    });

    findings.push(...data.issues);

    more = findings.length < data.total && data.issues.length > 0;

    page += 1;
  }

  return findings;
}

function plainText(value: string): string {
  return value
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

async function getRuleDetails(ruleKey: string): Promise<{
  name: string;
  remediation: string;
}> {
  const data = await sonarGet<RuleDetails>('/api/rules/show', {
    key: ruleKey,
    organization,
  });

  if (!data.rule) {
    throw new Error(`SonarCloud did not return rule ${ruleKey}`);
  }

  const sections = data.rule.descriptionSections ?? [];

  const fixSections = sections.filter((section) => /fix|solution|remediat/i.test(section.key ?? ''));

  const remediation = fixSections
    .map((section) => plainText(section.content ?? section.htmlContent ?? ''))
    .filter((value) => value.length > 0)
    .join('\n\n');

  return {
    name: data.rule.name ?? ruleKey,
    remediation:
      remediation ||
      'Rule-specific remediation was not returned by the API. Review the SonarCloud rule guidance before remediation.',
  };
}

function getSeverity(issue: SonarIssue): SonarSeverity {
  const securityImpacts = (issue.impacts ?? [])
    .filter((impact) => impact.softwareQuality === 'SECURITY')
    .map((impact) => impact.severity);

  for (const severity of severityOrder) {
    if (securityImpacts.includes(severity)) {
      return severity;
    }
  }

  throw new Error(`No supported SECURITY severity found for ${issue.key}`);
}

function jiraSeverity(severity: SonarSeverity): SeverityMapping {
  return severityMappings[severity];
}

function locationText(location: SonarLocation): string {
  const file = location.component ?? 'Unknown file';

  const line = location.textRange?.startLine;

  return [file, line === undefined ? '' : `:${String(line)}`, location.msg ? ` - ${location.msg}` : ''].join('');
}

function trace(issue: SonarIssue): {
  source: string;
  sink: string;
  flow: string[];
} {
  const locations = issue.flows?.find((flow) => (flow.locations?.length ?? 0) >= 2)?.locations;

  const firstLocation = locations?.[0];
  const lastLocation = locations?.at(-1);

  if (locations && firstLocation && lastLocation) {
    return {
      source: locationText(firstLocation),
      sink: locationText(lastLocation),
      flow: locations.map(locationText),
    };
  }

  const primary = [issue.component, issue.line === undefined ? '' : `:${String(issue.line)}`].join('');

  return {
    source: 'Source-to-sink trace not supplied for this finding',
    sink: `Primary finding location (not a verified sink): ${primary}`,
    flow: [],
  };
}

function issueLabel(key: string): string {
  const identifier = `${sonarProject}:${key}`;

  const hash = createHash('sha256').update(identifier).digest('hex').slice(0, 24);

  return `sonar-${hash}`;
}

async function existingTicket(label: string): Promise<string | undefined> {
  let nextPageToken: string | undefined;

  do {
    const url = new URL('/rest/api/3/search/jql', `${jiraUrl}/`);

    url.searchParams.set('jql', `project = ${jiraProject} AND labels = "${label}"`);

    url.searchParams.set('fields', 'labels');

    url.searchParams.set('maxResults', '100');

    if (nextPageToken) {
      url.searchParams.set('nextPageToken', nextPageToken);
    }

    const response = await jiraRequest(`${url.pathname}${url.search}`);

    const data = (await response.json()) as JiraSearch;

    const existing = data.issues.find((item) => item.fields?.labels?.includes(label))?.key;

    if (existing) {
      return existing;
    }

    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  return undefined;
}

function paragraph(value: string): AdfNode {
  return {
    type: 'paragraph',
    content: [
      {
        type: 'text',
        text: value.slice(0, 12000) || ' ',
      },
    ],
  };
}

function heading(value: string): AdfNode {
  return {
    type: 'heading',
    attrs: {
      level: 3,
    },
    content: [
      {
        type: 'text',
        text: value,
      },
    ],
  };
}

function bullet(value: string): AdfNode {
  return {
    type: 'bulletList',
    content: [
      {
        type: 'listItem',
        content: [paragraph(value)],
      },
    ],
  };
}

function divider(): AdfNode {
  return {
    type: 'rule',
  };
}

function requiredRule(issue: SonarIssue): string {
  if (!issue.rule) {
    throw new Error(`Finding ${issue.key} has no rule key`);
  }

  return issue.rule;
}

function findingUrl(issue: SonarIssue): string {
  const url = new URL('/project/issues', `${sonarUrl}/`);

  url.searchParams.set('id', sonarProject);

  url.searchParams.set('issues', issue.key);

  return url.toString();
}

function createDescription(
  issue: SonarIssue,
  rule: {
    name: string;
    remediation: string;
  },
  severity: SeverityMapping
): {
  type: string;
  version: number;
  content: AdfNode[];
} {
  const traced = trace(issue);
  const ruleKey = requiredRule(issue);

  const content: AdfNode[] = [
    heading('SOURCE'),
    bullet(traced.source),

    paragraph(`Scanner: SonarCloud SAST | Project: ${sonarProject}`),

    divider(),

    heading('SINK'),
    bullet(traced.sink),

    ...(traced.flow.length > 0 ? [paragraph(`Reported execution flow: ${traced.flow.join(' -> ')}`)] : []),

    divider(),

    heading('Vulnerability Summary'),

    paragraph(`Severity: ${severity.label} | Type: ${rule.name} (${ruleKey})`),

    paragraph(issue.message),

    divider(),

    heading('Details'),

    paragraph(`SonarCloud issue: ${issue.key}`),

    paragraph(`Branch: main | Component: ${issue.component}`),

    paragraph(`Finding URL: ${findingUrl(issue)}`),

    ...(issue.creationDate ? [paragraph(`First detected: ${issue.creationDate}`)] : []),

    divider(),

    heading('Proposed Remediation'),

    paragraph(rule.remediation),

    paragraph('Review the full rule guidance in SonarCloud before implementing the remediation.'),

    divider(),

    heading('DEFINITION OF DONE'),

    paragraph('Finding remediated and verified according to the vulnerability management process.'),
  ];

  return {
    type: 'doc',
    version: 1,
    content,
  };
}

function environmentAdf(value: string): {
  type: string;
  version: number;
  content: AdfNode[];
} {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: value,
          },
        ],
      },
    ],
  };
}

async function createTicket(issue: SonarIssue, stakeholderAccountId: string): Promise<string> {
  const ruleKey = requiredRule(issue);

  const severity = getSeverity(issue);
  const mappedSeverity = jiraSeverity(severity);

  const dueDate = calculateDueDate(severity, issue.creationDate);

  const rule = await getRuleDetails(ruleKey);

  const labels = ['automated', issueLabel(issue.key)];

  const summary = `[SonarCloud][${mappedSeverity.label}] ${issue.message}`.slice(0, 255);

  const description = createDescription(issue, rule, mappedSeverity);

  const fields: Record<string, unknown> = {
    project: {
      key: jiraProject,
    },

    issuetype: {
      name: 'Task',
    },

    summary,
    labels,
    description,

    [jiraFields.source]: 'SonarCloud SAST',

    [jiraFields.severity]: {
      id: mappedSeverity.optionId,
    },

    priority: {
      id: mappedSeverity.priorityId,
    },

    [jiraFields.environment]: environmentAdf(jiraEnvironment),

    [jiraFields.stakeholders]: [
      {
        accountId: stakeholderAccountId,
      },
    ],

    ...(dueDate
      ? {
          duedate: dueDate,
        }
      : {}),
  };

  // Impact requires security triage.
  // CVSS and EPSS require verified scoring.
  // Exception review date requires approval.
  // Issue security must be verified before production.

  const response = await jiraRequest('/rest/api/3/issue', {
    method: 'POST',
    body: JSON.stringify({
      fields,
    }),
  });

  const created = (await response.json()) as JiraCreated;

  return created.key;
}

async function runProduction(): Promise<void> {
  const findings = await getFindings();

  console.log(`Found ${String(findings.length)} HIGH/BLOCKER security findings on main`);

  let created = 0;
  let stakeholderAccountId: string | undefined;

  for (const issue of findings) {
    if (!dryRun && created >= maxTickets) {
      break;
    }

    const label = issueLabel(issue.key);

    const existing = await existingTicket(label);

    if (existing) {
      console.log(`Already tracked: ${issue.key} -> ${existing}`);
      continue;
    }

    const severity = getSeverity(issue);
    const mappedSeverity = jiraSeverity(severity);

    const dueDate = calculateDueDate(severity, issue.creationDate);

    stakeholderAccountId ??= await resolveStakeholderAccountId();

    if (dryRun) {
      console.log(
        `[DRY RUN] Would create ${mappedSeverity.label} ticket for ${issue.key} | Environment: ${jiraEnvironment} | Stakeholder: ${stakeholderName} | Due: ${dueDate ?? 'N/A'}`
      );
      continue;
    }

    const key = await createTicket(issue, stakeholderAccountId);

    console.log(`Created ${jiraUrl}/browse/${key} for ${issue.key} | Due: ${dueDate ?? 'N/A'}`);

    const today = new Date().toISOString().slice(0, 10);

    if (dueDate && dueDate < today) {
      console.warn(`Remediation due date already passed for ${issue.key}: ${dueDate}`);
    }

    created += 1;
  }

  console.log(`Created ${String(created)} Jira tickets`);
}

async function main(): Promise<void> {
  validateExecution();

  console.log('Mode: MAIN FINDINGS');
  console.log(`Dry run: ${String(dryRun)}`);

  await runProduction();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
