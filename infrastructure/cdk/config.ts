import { Tags } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// If there's a '.env' in this dir - load the file - this is use in conjuection with dev scripts
if (existsSync('./.env')) {
  console.log(`Loading: ${join('./.env')}`);
  dotenv.config({ path: join('./.env') });
}

export const unremoveableEnvironments = ['dev', 'stg', 'prod'];

export const config = {
  // Metadata
  project: 'uns',
  env: process.env.env ?? 'dev',
  region: process.env.region ?? 'eu-west-2',
  version: process.env.version ?? 'manual',
  isMainEnv: () => unremoveableEnvironments.includes(config.env),

  // mTLS confing
  mtls: process.env.use_mtls == 'true',
  mtlsEnvToUse: process.env.mtls_env_to_use ?? (null as string | null),

  // VPC
  vpc: {
    cidr: process.env.cidr ?? '10.0.0.0/16',
    zones: (process.env.availability_zones ?? `a,b,c`).split(`,`),
  },

  utils: {
    namingHelper: (...args: string[]) => [config.project, config.env, ...args].join('-').toLowerCase(),
    namingHelperSnakeCase: (...args: string[]) =>
      config.utils
        .namingHelper(...args)
        .split('-')
        .join('_'),
    namespace: () => [config.project, config.env].join(`-`),
    tagsHelper: (construct: Construct, additionalTags?: Record<string, string>) => {
      for (const [key, value] of Object.entries({
        project: config.project,
        env: config.project,
        version: config.version,
        managedBy: 'CDK',
        ...(additionalTags ?? {}),
      })) {
        Tags.of(construct).add(key, value);
      }
    },
  },
};

export type EnvVars = typeof config;
