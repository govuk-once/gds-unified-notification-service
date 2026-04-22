import {
  GatewayVpcEndpoint,
  GatewayVpcEndpointAwsService,
  InterfaceVpcEndpoint,
  InterfaceVpcEndpointAwsService,
  IpAddresses,
  SecurityGroup,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import { Stack } from 'aws-cdk-lib/core';
import { EnvVars } from 'infrastructure/cdk/config';
export const vpcFactory = <
  InterfaceEndpoints extends object | Record<string, InterfaceVpcEndpointAwsService>,
  InterfaceKeys extends keyof InterfaceEndpoints,
  GatewayEndpoints extends object | Record<string, GatewayVpcEndpointAwsService>,
  GatewayKeys extends keyof GatewayEndpoints,
>(
  stack: Stack,
  config: EnvVars,
  props: {
    name: string;
    cidr: string;
    zones: string[];
    interfaceEndpoints?: InterfaceEndpoints;
    gatewayEndpoints?: GatewayEndpoints;
  }
) => {
  const { namingHelper } = config.utils;

  const availabilityZones = props.zones.map((zone) => `${stack.env.region}${zone}`);
  // Create VPC
  const vpc = new Vpc(stack, namingHelper(props.name, 'vpc'), {
    vpcName: namingHelper(props.name, 'vpc'),
    ipAddresses: IpAddresses.cidr(props.cidr),
    natGateways: props.zones.length,
    availabilityZones,
    subnetConfiguration: [
      {
        name: namingHelper(props.name, 'sn', 'public'),
        subnetType: SubnetType.PUBLIC,
        cidrMask: 23,
      },
      {
        name: namingHelper(props.name, 'sn', 'private'),
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        cidrMask: 23,
      },
    ],
    enableDnsHostnames: true,
    enableDnsSupport: true,
    createInternetGateway: true,
  });

  // Define security groups
  const privateEgress = new SecurityGroup(stack, namingHelper(props.name, 'sg', 'private'), {
    vpc,
    description: 'SecurityGroup with allow outbound',
    allowAllOutbound: false,
  });

  const privateIsolated = new SecurityGroup(stack, namingHelper(props.name, 'sg', 'isolated'), {
    vpc,
    description: 'SecurityGroup with deny outbound',
    allowAllOutbound: false,
  });

  const securityGroups = [privateEgress, privateIsolated];

  // Attach private interface endpoints endpoints to vpc
  const interfaceEndpoints = {} as Record<string, InterfaceVpcEndpoint>;
  for (const key in props.interfaceEndpoints ?? {}) {
    const service = ((props.interfaceEndpoints ?? {}) as Record<string, InterfaceVpcEndpointAwsService>)[key];
    const endpoint = vpc.addInterfaceEndpoint(service.shortName, {
      service,
      privateDnsEnabled: true,
      securityGroups: [privateEgress],
      subnets: {
        subnets: vpc.privateSubnets,
      },
      open: true,
    });
    interfaceEndpoints[key] = endpoint;
  }

  // Attach private gateway endpoints endpoints to vpc
  const gatewayEndpoints = {} as Record<string, GatewayVpcEndpoint>;
  for (const key in props.gatewayEndpoints ?? {}) {
    const service = ((props.gatewayEndpoints ?? {}) as Record<string, GatewayVpcEndpointAwsService>)[key];
    const endpoint = vpc.addGatewayEndpoint(key, {
      service,
    });
    gatewayEndpoints[key] = endpoint;
  }

  return {
    vpc,
    securityGroups: {
      privateEgress,
      privateIsolated,
    },
    interfaceEndpoints: interfaceEndpoints as { [key in InterfaceKeys]: InterfaceVpcEndpoint },
    gatewayEndpoints: gatewayEndpoints as { [key in GatewayKeys]: GatewayVpcEndpoint },
  };
};
