import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { CfnDeletionPolicy, RemovalPolicy } from 'aws-cdk-lib';
import { InterfaceVpcEndpointAttributes } from 'aws-cdk-lib/aws-ec2';
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { camelCase } from './utils/camelCase';

// If there's a '.env' in this dir - load the file - this is use in conjuection with dev scripts
if (existsSync('./.env')) {
  console.log(`Loading from within infrastructure/cdk: ${join('./.env')}`);
  dotenv.config({ path: join('./.env') });
}

// If this file is loaded from project root - i.e. via vitest
if (existsSync('./infrastructure/cdk/.env')) {
  console.log(`Loading from root project dir: ${join('./infrastructure/cdk/.env')}`);
  dotenv.config({ path: join('infrastructure/cdk/.env') });
}

export const unremoveableEnvironments = ['dev', 'stg', 'prod'];
export const environmentLabels: Record<string, string> = {
  dev: 'development',
  stg: 'staging',
  prod: 'production',
};
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
    'No explicit environment defined, set `env` environment in the CICD or via pnpm run development:sandbox:setup'
  );
}

// Infer values from env variables
const project = 'uns';
const env = process.env.env ?? 'dev';
const region = process.env.region ?? 'eu-west-2';
const prefix = `${project}-${env}`;
const version = process.env.code_version ?? `sandbox@${new Date().toISOString()}`;
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
    // Applying https://gdsgovukagents.atlassian.net/wiki/spaces/GOP/pages/81461354/AWS+Resource+Tagging+Standard
    Service: config.project,
    Environment: environmentLabels[config.env] ?? 'sandbox',
    Owner: 'govuk-once-uns-dl@digital.cabinet-office.gov.uk',
    Source: 'https://github.com/govuk-once/gds-unified-notification-service',
    CostCentre: 'ONCE-001',
    ManagedBy: 'CDK',
    Version: config.version,
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

  // Only used in sandbox environments to avoid resource duplication
  sandbox: {
    shared: {
      vpc: await fromSSMJSON<{
        vpcId: string;
        vpcCidr: string;
        availabilityZones: string[];
        publicSubnetIds: string[];
        publicSubnetRouteTableIds: string[];
        privateSubnetIds: string[];
        privateSubnetRouteTableIds: string[];
        isolatedSubnetIds: string[];
        isolatedSubnetRouteTableIds: string[];
        // SG
        privateEgressSecurityGroup: string;
        privateIsolatedSecurityGroup: string;
        // Endpoints
        interfaceEndpoints: [string, InterfaceVpcEndpointAttributes][];
        gatewayEndpoints: [string, string][];
      } | null>(`/shared/vpc`, null),

      // mTLS
      ca: await fromSSM(`/shared/mtls/truststore`, ''),
      revocationTable: await fromSSM(`/shared/mtls/revocation/tableArn`, ''),
      revocationAttributes: await fromSSMJSON<Record<string, string>>(`/shared/mtls/revocation/attributes`, {}),
      kms: (await fromSSM(`/shared/mtls/kmsArn`, '')) as string,
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
