// Shared AWS managed rule statement builder - used by both the regional (API Gateway)
// and CLOUDFRONT scoped WAF Web ACLs so the two stay consistent.
export function managedWafRule(ruleProps: {
  priority: number;
  name: string;
  managedRuleName: string;
  metricName: string;
}) {
  return {
    name: ruleProps.name,
    priority: ruleProps.priority,
    statement: {
      managedRuleGroupStatement: {
        vendorName: 'AWS',
        name: ruleProps.managedRuleName,
      },
    },
    overrideAction: { none: {} },
    visibilityConfig: {
      cloudWatchMetricsEnabled: true,
      metricName: ruleProps.metricName,
      sampledRequestsEnabled: true,
    },
  };
}
