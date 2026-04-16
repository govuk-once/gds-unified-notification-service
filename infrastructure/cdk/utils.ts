import { config } from './config';

export const namingHelper = (...args: string[]) => {
  return [config.project, config.env, ...args].join('-').toLowerCase();
};
