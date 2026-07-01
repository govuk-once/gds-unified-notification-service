import { CfnResource, Stack } from 'aws-cdk-lib';
import {
  AclCidr,
  AclTraffic,
  Action,
  GatewayVpcEndpoint,
  GatewayVpcEndpointAwsService,
  IGatewayVpcEndpoint,
  IInterfaceVpcEndpoint,
  InterfaceVpcEndpoint,
  InterfaceVpcEndpointAwsService,
  IpAddresses,
  ISecurityGroup,
  IVpc,
  NetworkAcl,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  TrafficDirection,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { applyCheckovSkips } from 'infrastructure/cdk/utils/applyCheckovSkip';
import { SSMFromObject } from 'infrastructure/cdk/utils/SSMFromObject';

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
  public readonly vpc: IVpc;

  public readonly securityGroups: {
    readonly privateEgress: ISecurityGroup;
    readonly privateIsolated: ISecurityGroup;
  };

  public readonly interfaceEndpoints: { [K in keyof InterfaceEndpoints]: IInterfaceVpcEndpoint };
  public readonly gatewayEndpoints: { [K in keyof GatewayEndpoints]: IGatewayVpcEndpoint };

  constructor(scope: Construct, config: EnvVars, props: UNSVpcConstructProps<InterfaceEndpoints, GatewayEndpoints>) {
    const { namingHelper, constructNamingHelper } = config.utils;
    super(scope, constructNamingHelper(...props.name));

    const stack = Stack.of(this);

    const availabilityZones = props.zones.map((zone) => `${stack.env.region}${zone}`);

    // Use imports if we're in sandbox env instead of creating infrastructure
    if (config.isMainEnv == false && config.sandbox.shared.vpc !== null) {
      const imported = this.imports(config.sandbox.shared.vpc);
      this.vpc = imported.vpc;
      this.securityGroups = imported.securityGroups;
      this.interfaceEndpoints = imported.interfaceEndpoints;
      this.gatewayEndpoints = imported.gatewayEndpoints;
      return;
    }

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
      allowAllOutbound: false,
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
    const interfaceEndpointsMap = {} as Record<string, IInterfaceVpcEndpoint>;
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

    // Define exports for sandbox environment
    this.exports(config);

    // Network ACL
    const networkAcl = new NetworkAcl(this, namingHelper('network-acl'), {
      vpc: this.vpc,
      networkAclName: namingHelper('network-acl', this.vpc.vpcId),
      subnetSelection: {
        subnetGroupName: constructNamingHelper('sn', 'private')
      }
    })

    // Inbound Rules
    networkAcl.addEntry(namingHelper('network-acl', 'allow-https-in'), {
      ruleNumber: 110,
      cidr: AclCidr.anyIpv4(),
      traffic: AclTraffic.tcpPort(443),
      direction: TrafficDirection.INGRESS,
      ruleAction: Action.ALLOW,
    });

    networkAcl.addEntry(namingHelper('network-acl', 'deny-all-other-in'), {
      ruleNumber: 200,
      cidr: AclCidr.anyIpv4(),
      traffic: AclTraffic.allTraffic(),
      direction: TrafficDirection.INGRESS,
      ruleAction: Action.DENY,
    });

    // Outbound Rules
    networkAcl.addEntry(namingHelper('network-acl', 'allow-https-out'), {
      ruleNumber: 110,
      cidr: AclCidr.anyIpv4(),
      traffic: AclTraffic.tcpPort(443),
      direction: TrafficDirection.EGRESS,
      ruleAction: Action.ALLOW,
    });

    networkAcl.addEntry(namingHelper('network-acl', 'allow-redis-out'), {
      ruleNumber: 115,
      cidr: AclCidr.anyIpv4(),
      traffic: AclTraffic.tcpPort(6378),
      direction: TrafficDirection.EGRESS,
      ruleAction: Action.ALLOW,
    });

    networkAcl.addEntry(namingHelper('network-acl', 'deny-all-other-out'), {
      ruleNumber: 200,
      cidr: AclCidr.anyIpv4(),
      traffic: AclTraffic.allTraffic(),
      direction: TrafficDirection.EGRESS,
      ruleAction: Action.DENY,
    });
  }

  imports(imported: NonNullable<EnvVars['sandbox']['shared']['vpc']>) {
    const vpc: UNSVpcConstruct['vpc'] = Vpc.fromVpcAttributes(this, `vpc-imported`, {
      vpcId: imported.vpcId,
      vpcCidrBlock: imported.vpcCidr,
      availabilityZones: imported.availabilityZones,
      publicSubnetIds: imported.publicSubnetIds,
      publicSubnetRouteTableIds: imported.publicSubnetRouteTableIds,
      privateSubnetIds: imported.privateSubnetIds,
      privateSubnetRouteTableIds: imported.privateSubnetRouteTableIds,
      isolatedSubnetIds: imported.isolatedSubnetIds,
      isolatedSubnetRouteTableIds: imported.isolatedSubnetRouteTableIds,
    });
    const securityGroups: UNSVpcConstruct['securityGroups'] = {
      privateEgress: SecurityGroup.fromSecurityGroupId(
        this,
        'sg-private-imported',
        imported.privateEgressSecurityGroup
      ),
      privateIsolated: SecurityGroup.fromSecurityGroupId(
        this,
        'sg-isolated-imported',
        imported.privateEgressSecurityGroup
      ),
    };
    const interfaceEndpoints = {} as Record<string, IInterfaceVpcEndpoint>;

    for (const [key, value] of imported.interfaceEndpoints) {
      interfaceEndpoints[key] = InterfaceVpcEndpoint.fromInterfaceVpcEndpointAttributes(
        this,
        `${key}-interface-imported`,
        value
      );
    }
    const gatewayEndpoints = {} as Record<string, IGatewayVpcEndpoint>;
    for (const [key, value] of imported.gatewayEndpoints) {
      gatewayEndpoints[key] = GatewayVpcEndpoint.fromGatewayVpcEndpointId(this, `${key}-gateway-imported`, value);
    }

    return {
      vpc,
      securityGroups,
      interfaceEndpoints: interfaceEndpoints as (typeof this)['interfaceEndpoints'],
      gatewayEndpoints: gatewayEndpoints as (typeof this)['gatewayEndpoints'],
    };
  }
  exports(config: EnvVars) {
    // Export details of the vpc - so sandbox environments can join in instead of creating their own
    if (config.exportResourcesForDevSandboxUse) {
      const vpcConfig: typeof config.sandbox.shared.vpc = {
        // VPC
        vpcId: this.vpc.vpcId,
        vpcCidr: this.vpc.vpcCidrBlock,
        availabilityZones: this.vpc.availabilityZones,
        publicSubnetIds: this.vpc.publicSubnets.map((s) => s.subnetId),
        publicSubnetRouteTableIds: this.vpc.publicSubnets.map((s) => s.routeTable.routeTableId),
        privateSubnetIds: this.vpc.privateSubnets.map((s) => s.subnetId),
        privateSubnetRouteTableIds: this.vpc.privateSubnets.map((s) => s.routeTable.routeTableId),
        isolatedSubnetIds: this.vpc.isolatedSubnets.map((s) => s.subnetId),
        isolatedSubnetRouteTableIds: this.vpc.isolatedSubnets.map((s) => s.routeTable.routeTableId),

        // Security groups
        privateEgressSecurityGroup: this.securityGroups.privateEgress.securityGroupId,
        privateIsolatedSecurityGroup: this.securityGroups.privateIsolated.securityGroupId,

        // Endpoints
        interfaceEndpoints: Object.entries(this.interfaceEndpoints).map(([key, value]) => [
          key,
          {
            port: 443,
            vpcEndpointId: value.vpcEndpointId,
            securityGroups: [],
          },
        ]),
        gatewayEndpoints: Object.entries(this.gatewayEndpoints).map(([key, value]) => [key, value.vpcEndpointId]),
      };

      SSMFromObject(
        this,
        config,
        {
          'shared/vpc': vpcConfig,
        },
        { omitNamespace: true }
      );
      return;
    }
  }
}
