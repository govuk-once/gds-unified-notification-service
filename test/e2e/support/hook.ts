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
  await Promise.allSettled(this.cleanups.map((clean) => clean()));
});
