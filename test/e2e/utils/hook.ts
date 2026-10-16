import { Before, setDefaultTimeout, setWorldConstructor } from '@cucumber/cucumber';
import { prepareDispatchAgent } from '@test/e2e/utils/setup.e2e';
import { Agent } from 'undici';
import CustomWorld from './world';

setWorldConstructor(CustomWorld);
setDefaultTimeout(30 * 1000); // 30 second timeout

// Cucumber creates a fresh World for each scenario
// Run the async Before but cache the result so it only executes once:
let dispatchAgent: Agent;
Before(async function (this: CustomWorld) {
  if (!dispatchAgent) {
    dispatchAgent = await prepareDispatchAgent();
  }
  await this.applyDispatchConfig(dispatchAgent);
});

let messageExists = false;
Before(async function (this: CustomWorld) {
  if (!messageExists) {
    await this.createNotificationIfNotFound();
    messageExists = true;
  }
});
