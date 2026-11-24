import { register } from 'tsx/esm/api';

/*
 * Register tsx before loading any TypeScript test modules.
 * Keep this module first in the Cucumber import list and keep register()
 * at the top level; otherwise Cucumber workers may load TypeScript modules
 * before tsx is registered and attempt to execute them as plain JavaScript.
 */

register();
