import { Before, setDefaultTimeout, setWorldConstructor } from '@cucumber/cucumber';
import { prepareDispatchConfig } from '@test/e2e/utils/setup.e2e';
import CustomWorld from './world';

setWorldConstructor(CustomWorld);
setDefaultTimeout(30 * 1000); // 30 second timeout

// Cucumber creates a fresh World for each scenario
// Run the async Before but cache the result so it only executes once:
let dispatchConfigCache: Awaited<ReturnType<typeof prepareDispatchConfig>>;
Before(async function (this: CustomWorld) {
  if (!dispatchConfigCache) {
    dispatchConfigCache = await prepareDispatchConfig(this);
  }
  this.applyDispatchConfig(dispatchConfigCache);
});
