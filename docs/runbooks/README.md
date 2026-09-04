# Runbooks

Operational runbooks for the GDS Unified Notification Service. Use the table below to find the runbook that matches your situation.

| Runbook                                                                    | Use it when                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [Fix Forward](./fix-forward.md)                                              | You need to ship a corrective change during a live incident and want to choose the right path      |
| [API Gateway Errors](./api-gateway-errors.md)                                | PSO or Flex is returning an elevated rate of 4xx/5xx responses                                       |
| [Queue Backlog and Dispatch Failures](./queue-backlog-and-dispatch-failures.md) | A PSO SQS queue is backing up, a stage's failure rate is elevated, or the dispatch circuit breaker has opened |

These are a starting set, not exhaustive — see [Documentation Guide: templates](../documentation-guide.md#a-runbook) for the template to use when adding another.

---

## Runbook template

```markdown
# <Situation> Runbook

One sentence: what this covers and who it's for.

> A short framing note — what this incident is (and isn't), and the guiding principle for responding to it.

---

## Step 1: <identify/confirm>

## Step 2: <investigate>

## Step 3 onward: <mitigate, escalate, or resolve>

---

## After recovery

1. Confirm the alarms have cleared and held for an agreed settling period.
2. Raise follow-up work for anything the incident exposed.
3. Feed anything learned under pressure back into this runbook.

---

## Related

**Guides:** ...
**Code:** ...
```

Ground every runbook in real alarm names, real file paths and real thresholds pulled from the code — see [Infrastructure Development Guide: CloudWatch alarms](../infrastructure-development.md#cloudwatch-alarms) for the current alarm catalogue. A runbook that describes an alarm or threshold that doesn't exist in the code is worse than no runbook.

---

## Related

**Guides:**

- [Documentation Guide](../documentation-guide.md)
- [Deployment Guide](../deployment.md)
- [Infrastructure Development Guide](../infrastructure-development.md)
