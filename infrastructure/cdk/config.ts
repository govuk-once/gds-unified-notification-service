import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// If there's a '.env' in this dir - load the file - this is use in conjuection with dev scripts
if (existsSync('./.env')) {
  console.log(`Loading: ${join('./.env')}`);
  dotenv.config({ path: join('./.env') });
}

export const config = {
  project: 'uns',
  env: process.env.env ?? 'dev',
  region: process.env.region ?? 'eu-west-2',
  mtls: process.env.use_mtls == 'true',
  mtlsEnvToUse: process.env.mtls_env_to_use ?? (null as string | null),
  // vpc config
  vpc: {
    cidr: process.env.cidr ?? '10.0.0.0/16',
    zones: (process.env.availability_zones ?? `a,b,c`).split(`,`),
  },

  utils: {
    namingHelper: (...args: string[]) => [config.project, config.env, ...args].join('-').toLowerCase(),
  },
};

export type EnvVars = typeof config;
