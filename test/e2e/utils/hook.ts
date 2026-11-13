import { BeforeAll, Before, setDefaultTimeout, setWorldConstructor, After } from '@cucumber/cucumber';
import { config } from '@infra/cdk/config';
import { prepareDispatchAgent } from '@test/e2e/utils/setup.e2e';
import { Domains, resolveDomains, fetchApiKeys, ApiKeys } from '@shared/credentials';
import { Agent } from 'undici';
import CustomWorld from './world';

setWorldConstructor(CustomWorld);
setDefaultTimeout(30 * 1000); // 30 second timeout

// Cucumber creates a fresh World for each scenario
// Run the async Before but cache the result so it only executes once:
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

let messageExists = false;
Before(async function (this: CustomWorld) {
  if (!messageExists) {
    await this.createNotificationIfNotFound();
    messageExists = true;
  }
});

After(async function (this: CustomWorld) {
  await Promise.allSettled(this.cleanups.map((clean) => clean()));
});
