import { After, Before, BeforeAll, setDefaultTimeout, setWorldConstructor } from '@cucumber/cucumber';
import { config } from '@infra/cdk/config';
import { ApiKeys, Domains, fetchApiKeys, resolveDomains } from '@shared/credentials';
import { prepareDispatchAgent } from '@test/e2e/helpers/client';
import { Agent } from 'undici';
import CustomWorld from '@test/e2e/support/world';

setWorldConstructor(CustomWorld);
setDefaultTimeout(30 * 1000); // 30 second timeout

/*
 * Cucumber creates a fresh World for each scenario.
 * Cache the BeforeAll resources outside the World so each scenario can reuse them.
 * NOTE: Cucumber runs BeforeAll once in each parallel worker.
 */
let dispatchAgent: Agent;
let apiKeys: ApiKeys;
let domains: Domains;
BeforeAll(async function () {
  dispatchAgent = await prepareDispatchAgent();
  const usePrivateGateway = config.isE2ERunner;
  const flexKeyMarker = usePrivateGateway ? 'private' : 'e2e';

  apiKeys = await fetchApiKeys(flexKeyMarker);
  domains = await resolveDomains(usePrivateGateway);
});

Before(function (this: CustomWorld) {
  this.applyDispatchConfig(dispatchAgent, apiKeys, domains);
});

Before({ tags: '@CIOnly' }, function () {
  const isCI = config.isE2ERunner || process.env.GITHUB_ACTIONS === 'true';
  if (!isCI) return 'skipped';
});

After(async function (this: CustomWorld) {
  const results = await Promise.allSettled(this.cleanups.map((clean) => clean()));
  const failures = results.flatMap((result, index) =>
    result.status === 'rejected' ? [{ index, reason: result.reason }] : []
  );

  if (failures.length > 0) {
    const details = failures
      .map(({ index, reason }) => {
        const message = reason instanceof Error ? `${reason.name}: ${reason.message}\n${reason.stack}` : String(reason);
        return `Cleanup ${index + 1}: ${message}`;
      })
      .join('\n');
    // Doesn't fail the test if clean up fails
    this.log(`⚠️ E2E cleanup failed (${failures.length}):\n${details}`);
  }
});
