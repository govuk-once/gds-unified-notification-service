import { CfnResource, Stack } from 'aws-cdk-lib';
import {
  GatewayVpcEndpoint,
  GatewayVpcEndpointAwsService,
  InterfaceVpcEndpoint,
  InterfaceVpcEndpointAwsService,
  IpAddresses,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { applyCheckovSkips } from 'infrastructure/cdk/utils/applyCheckovSkip';

export interface UNSVpcConstructProps<InterfaceEndpoints, GatewayEndpoints> {
  readonly name: string[];
  readonly cidr: string;
  readonly zones: string[];
  readonly interfaceEndpoints?: InterfaceEndpoints;
  readonly gatewayEndpoints?: GatewayEndpoints;
}

export class UNSVpcConstruct<
  InterfaceEndpoints extends Record<string, InterfaceVpcEndpointAwsService> = Record<
    string,
    InterfaceVpcEndpointAwsService
  >,
  GatewayEndpoints extends Record<string, GatewayVpcEndpointAwsService> = Record<string, GatewayVpcEndpointAwsService>,
> extends Construct {
  public readonly vpc: Vpc;

  public readonly securityGroups: {
    readonly privateEgress: SecurityGroup;
    readonly privateIsolated: SecurityGroup;
  };

  public readonly interfaceEndpoints: { [K in keyof InterfaceEndpoints]: InterfaceVpcEndpoint };
  public readonly gatewayEndpoints: { [K in keyof GatewayEndpoints]: GatewayVpcEndpoint };

  constructor(scope: Construct, config: EnvVars, props: UNSVpcConstructProps<InterfaceEndpoints, GatewayEndpoints>) {
    const { namingHelper, constructNamingHelper } = config.utils;
    super(scope, constructNamingHelper(...props.name));

    const stack = Stack.of(this);

    const availabilityZones = props.zones.map((zone) => `${stack.env.region}${zone}`);

    // Initialize the VPC
    this.vpc = new Vpc(this, `vpc`, {
      vpcName: namingHelper(...props.name, 'vpc'),
      ipAddresses: IpAddresses.cidr(props.cidr),
      natGateways: props.zones.length,
      availabilityZones,
      subnetConfiguration: [
        {
          name: constructNamingHelper('sn', 'public'),
          subnetType: SubnetType.PUBLIC,
          cidrMask: 23,
        },
        {
          name: constructNamingHelper('sn', 'private'),
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 23,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
      createInternetGateway: true,
    });

    // Define Security Groups
    const privateEgress = new SecurityGroup(this, constructNamingHelper('sg', 'private'), {
      vpc: this.vpc,
      description: 'SecurityGroup with allow outbound',
      allowAllOutbound: true,
    });
    privateEgress.addIngressRule(Peer.ipv4(this.vpc.vpcCidrBlock), Port.tcp(6379), 'Allow VPC Elasticache traffic');
    privateEgress.addEgressRule(Peer.ipv4(this.vpc.vpcCidrBlock), Port.tcp(6379), 'Allow VPC Elasticache traffic');

    const privateIsolated = new SecurityGroup(this, constructNamingHelper('sg', 'isolated'), {
      vpc: this.vpc,
      description: 'SecurityGroup with deny outbound',
      allowAllOutbound: false,
    });
    privateIsolated.addIngressRule(Peer.ipv4(this.vpc.vpcCidrBlock), Port.tcp(6379), 'Allow VPC Elasticache traffic');
    privateIsolated.addEgressRule(Peer.ipv4(this.vpc.vpcCidrBlock), Port.tcp(6379), 'Allow VPC Elasticache traffic');
    this.securityGroups = { privateEgress, privateIsolated };

    // Attach Interface VPC Endpoints
    const interfaceEndpointsMap = {} as Record<string, InterfaceVpcEndpoint>;
    for (const key in props.interfaceEndpoints ?? {}) {
      const service = (props.interfaceEndpoints as Record<string, InterfaceVpcEndpointAwsService>)[key];
      const endpoint = this.vpc.addInterfaceEndpoint(`interface-${service.shortName}`, {
        service,
        privateDnsEnabled: true,
        securityGroups: [privateEgress],
        subnets: {
          subnets: this.vpc.privateSubnets,
        },
        open: true,
      });
      interfaceEndpointsMap[key] = endpoint;
    }
    this.interfaceEndpoints = interfaceEndpointsMap as { [K in keyof InterfaceEndpoints]: InterfaceVpcEndpoint };

    // Attach Gateway VPC Endpoints
    const gatewayEndpointsMap = {} as Record<string, GatewayVpcEndpoint>;
    for (const key in props.gatewayEndpoints ?? {}) {
      const service = (props.gatewayEndpoints as Record<string, GatewayVpcEndpointAwsService>)[key];
      const endpoint = this.vpc.addGatewayEndpoint(`gateway-${key}`, {
        service,
      });
      gatewayEndpointsMap[key] = endpoint;
    }
    this.gatewayEndpoints = gatewayEndpointsMap as { [K in keyof GatewayEndpoints]: GatewayVpcEndpoint };

    // Apply Checkov Skips to the CloudFormation deployment helper lambda
    const cloudFormationVpcStruct = stack.node.tryFindChild('Custom::VpcRestrictDefaultSGCustomResourceProvider') as
      | {
          readonly handler?: CfnResource;
        }
      | undefined;

    if (cloudFormationVpcStruct?.handler) {
      applyCheckovSkips(cloudFormationVpcStruct.handler, [
        ['CKV_AWS_117', 'Not all lambdas need to be in VPCs by design'],
        ['CKV_AWS_116', 'Lambda is not used for asyncronous processing'],
        ['CKV_AWS_115', 'Default concurrency limit is sufficient'],
      ]);
    }
  }
}
