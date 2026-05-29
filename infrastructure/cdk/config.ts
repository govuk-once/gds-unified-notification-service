import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { CfnDeletionPolicy, RemovalPolicy, Tags } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import dotenv from 'dotenv';
import { camelCase } from 'infrastructure/cdk/utils/camelCase';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

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

// Infer values from env variables
const project = 'uns';
const env = process.env.env ?? 'dev';
const region = process.env.region ?? 'eu-west-2';
const prefix = `${project}-${env}`;
const version = process.env.version ?? 'manual';
const namespace = [project, env].join(`-`);
const isMainEnv = unremoveableEnvironments.includes(env);
const mtls = process.env.use_mtls == 'true';

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
    env: config.project,
    version: config.version,
    managedBy: 'CDK',
  }),

  // Delete / retain policy - main environment resources should avoid deletion
  removalPolicy: isMainEnv ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
  deletionPolicy: isMainEnv ? CfnDeletionPolicy.RETAIN : CfnDeletionPolicy.DELETE,

  // Flags
  isMainEnv,

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

  utils: {
    constructNamingHelper: (...args: string[]) => camelCase(...args),
    namingHelper: (...args: string[]) => [config.project, config.env, ...args].join('-').toLowerCase(),
    namingHelperSnakeCase: (...args: string[]) =>
      config.utils
        .namingHelper(...args)
        .split('-')
        .join('_'),
    tagsHelper: (construct: Construct, additionalTags?: Record<string, string>) => {
      for (const [key, value] of Object.entries({
        ...config.defaultTags(),
        ...(additionalTags ?? {}),
      })) {
        Tags.of(construct).add(key, value);
      }
    },
  },
};

export type EnvVars = typeof config;
