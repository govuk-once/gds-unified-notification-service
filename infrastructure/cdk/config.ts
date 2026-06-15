import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { CfnDeletionPolicy, RemovalPolicy } from 'aws-cdk-lib/core';
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { camelCase } from './utils/camelCase';

// If there's a '.env' in this dir - load the file - this is use in conjuection with dev scripts
if (existsSync('./.env')) {
  console.log(`Loading: ${join('./.env')}`);
  dotenv.config({ path: join('./.env') });
}

export const unremoveableEnvironments = ['dev', 'stg', 'prod'];

export const fromSSM = async (key: string, fallback?: string | null) => {
  const useFallback = (value: string | undefined) => {
    if (value === undefined && fallback === undefined) {
      throw new Error(`Failed to retrieve ${key} - aborting`);
    }
    return value ?? fallback;
  };
  try {
    return useFallback(
      (
        await new SSMClient().send(
          new GetParameterCommand({
            Name: key,
            WithDecryption: true,
          })
        )
      ).Parameter?.Value
    );
  } catch {
    return useFallback(undefined);
  }
};

export const fromSSMJSON = async <T>(key: string, fallbackToSerialize?: T) => {
  return JSON.parse((await fromSSM(key, JSON.stringify(fallbackToSerialize))) as string) as T;
};

if (process.env.env == undefined) {
  throw new Error(
    'No explicit environment defined, set `env` environment in the CICD or via npm run development:sandbox:setup'
  );
}

// Infer values from env variables
const project = 'uns';
const env = process.env.env ?? 'dev';
const region = process.env.region ?? 'eu-west-2';
const prefix = `${project}-${env}`;
const version = process.env.code_version ?? 'manual';
const namespace = [project, env].join(`-`);
const isMainEnv = unremoveableEnvironments.includes(env);
const mtls = process.env.use_mtls == 'true';
const debugMode = env !== 'prod';
const debuggableFlexApiGateway = env == 'dev' || !isMainEnv;
const exportResourcesForDevSandboxUse = env == 'dev';
// Setup importable config object
export const config = {
  // Metadata
  project,
  env,
  prefix,
  region,
  version,
  namespace,
  defaultTags: () => ({
    project: config.project,
    env: config.env,
    managedBy: 'CDK',
  }),

  // Delete / retain policy - main environment resources should avoid deletion
  removalPolicy: isMainEnv ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
  deletionPolicy: isMainEnv ? CfnDeletionPolicy.RETAIN : CfnDeletionPolicy.DELETE,

  // Flags
  isMainEnv,
  debugMode,
  debuggableFlexApiGateway,
  exportResourcesForDevSandboxUse,

  // mTLS config
  mtls,

  ssm: {
    // These values are created by the Infra team and are always present in each AWS acc
    hostedZoneName: (await fromSSM('/infra/dns/hostedzonename', null))!,
    certificateArnRegional: (await fromSSM('/infra/acm/certificatearnregional', null))!,

    flex: {
      account: await fromSSMJSON<string | null>(`/${namespace}/flex/account`, null),
      vpce: await fromSSMJSON<string[]>(`/${namespace}/flex/vpce`, []),
    },
    udp: {
      sm: await fromSSMJSON<string | null>(`/${namespace}/udp/config/sm`, null),
      kms: await fromSSMJSON<string | null>(`/${namespace}/udp/config/kms`, null),
      role: await fromSSMJSON<string | null>(`/${namespace}/udp/config/role`, null),
    },
  },

  // VPC
  vpc: {
    cidr: process.env.cidr ?? '10.0.0.0/16',
    zones: (process.env.availability_zones ?? `a,b,c`).split(`,`),
  },

  // Only used in env environment to avoid resource duplication
  sandbox: {
    shared: {
      ca: await fromSSM(`/shared/mtls/truststore`, ''),
      revocationTable: await fromSSM(`/shared/mtls/revocation/tableArn`, ''),
      revocationAttributes: await fromSSMJSON<Record<string, string>>(`/shared/mtls/revocation/attributes`, {}),
    },
  },

  // Helper functions
  utils: {
    constructNamingHelper: (...args: string[]) => camelCase(...args),
    namingHelper: (...args: string[]) => [config.project, config.env, ...args].join('-').toLowerCase(),
    namingHelperSnakeCase: (...args: string[]) =>
      config.utils
        .namingHelper(...args)
        .split('-')
        .join('_'),
    // Rolling week to week dates - used for short term mtls certs
    lastSunday: () => {
      const lastSunday = new Date();
      lastSunday.setDate(new Date().getDate() - new Date().getDay() - 1);
      lastSunday.setUTCHours(0, 0, 0, 0);
      return lastSunday;
    },
    nextSunday: () => {
      const nextSunday = config.utils.lastSunday();
      nextSunday.setDate(config.utils.lastSunday().getDate() + 6);
      nextSunday.setUTCHours(23, 59, 59, 0);
      return nextSunday;
    },
    // Used to make once-platform-construct resource naming match
    namingProvider: () => ({
      getPrefix: () => config.prefix,
      getResourceId: (id?: string) => id,
      getResourceName: (id: string) => id,
    }),
  },
};

// Inject COPY env to ENVIRONMENT - as that's variable use by once-project-constructs
process.env.ENVIRONMENT = process.env.ENVIRONMENT ?? env;

export type EnvVars = typeof config;
