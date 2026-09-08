import { Stack, StackProps } from 'aws-cdk-lib';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSApiGatewayAlarmsConstruct } from 'infrastructure/cdk/constructs/alarmsConstructs/UNSApiGatewayAlarmsConstruct';
import { UNSAuthenticationAlarmsConstruct } from 'infrastructure/cdk/constructs/alarmsConstructs/UNSAuthenticationAlarmsConstruct';
import { UNSIntegrationAlarmsConstruct } from 'infrastructure/cdk/constructs/alarmsConstructs/UNSIntegrationAlarmsConstruct';
import { UNSOperationalAlarmsConstruct } from 'infrastructure/cdk/constructs/alarmsConstructs/UNSOperationalAlarmsConstruct';
import { UNSPerformanceAlarmsConstructs } from 'infrastructure/cdk/constructs/alarmsConstructs/UNSPerformanceAlarmsConstructs';
import { UNSWAFAlarmsConstruct } from 'infrastructure/cdk/constructs/alarmsConstructs/UNSWAFAlarmsConstructs';
import { UNSResourceContract } from 'infrastructure/cdk/constructs/UNSResourceContract';
import { ProviderDimension } from '../../../src/common/services/observabilityService';

export class UNSAlarmsStack extends Stack {
  public readonly apiGatewayAlarmsFLEXConstruct: UNSApiGatewayAlarmsConstruct;
  public readonly apiGatewayAlarmsPSOConstruct: UNSApiGatewayAlarmsConstruct;

  public readonly authenticationAlarmsConstruct: UNSAuthenticationAlarmsConstruct;
  public readonly operationalAlarmsConstruct: UNSOperationalAlarmsConstruct;
  public readonly performanceAlarmsConstructs: UNSPerformanceAlarmsConstructs;

  public readonly integrationAlarmsPSOConstruct: UNSIntegrationAlarmsConstruct;
  public readonly integrationAlarmsFLEXConstruct: UNSIntegrationAlarmsConstruct;

  public readonly wafAlarmsPSOConstruct: UNSWAFAlarmsConstruct;
  public readonly wafAlarmsFlexConstruct: UNSWAFAlarmsConstruct;

  constructor(scope: Construct, id: string, props: StackProps, config: EnvVars, resources: UNSResourceContract) {
    super(scope, id, props);

    const alertTopic = Topic.fromTopicArn(this, 'alertTopic', resources.alertTopicArn);

    // PSO Alarms
    const pso = new Construct(this, 'pso-alarms');
    const psoServiceName = 'pso';

    this.apiGatewayAlarmsPSOConstruct = new UNSApiGatewayAlarmsConstruct(pso, config, {
      restApiName: resources.pso.restApiName,
      alertTopic,
      group: psoServiceName,
    });

    this.authenticationAlarmsConstruct = new UNSAuthenticationAlarmsConstruct(pso, config, {
      alertTopic,
      group: psoServiceName,
    });

    this.wafAlarmsPSOConstruct = new UNSWAFAlarmsConstruct(pso, config, {
      wafName: resources.pso.wafName,
      alertTopic,
      group: psoServiceName,
    });

    this.operationalAlarmsConstruct = new UNSOperationalAlarmsConstruct(pso, config, {
      alertTopic,
      group: psoServiceName,
      queues: Object.entries(resources.pso.queueNames).map(([name, queueName]) => ({ name, queueName })),
    });

    const psoLambdas = resources.pso.lambdaFunctionNames;

    this.performanceAlarmsConstructs = new UNSPerformanceAlarmsConstructs(pso, config, {
      lambdas: Object.entries(psoLambdas)
        .filter((entry): entry is [string, string] => entry[1] !== undefined)
        .filter(([name]) => !['postGroupMessage', 'groupProcessingWorker', 'analytics'].includes(name))
        .map(([name, functionName]) => ({ name, functionName })),
      alertTopic,
      group: psoServiceName,
    });

    this.integrationAlarmsPSOConstruct = new UNSIntegrationAlarmsConstruct(pso, config, {
      alertTopic,
      group: psoServiceName,
      providers: [
        { name: 'OneSignal', provider: ProviderDimension.ONESIGNAL, direction: 'downstream' },
        { name: 'UDP', provider: ProviderDimension.UDP, direction: 'upstream' },
      ],
      lambdas: Object.entries(psoLambdas)
        .filter((entry): entry is [string, string] => entry[1] !== undefined)
        .map(([name, functionName]) => ({ name, functionName })),
    });

    // Flex Alarms
    const flex = new Construct(this, 'flex-alarms');
    const flexServiceName = 'flex';

    this.apiGatewayAlarmsFLEXConstruct = new UNSApiGatewayAlarmsConstruct(flex, config, {
      restApiName: resources.flex.restApiName,
      alertTopic,
      group: flexServiceName,
    });

    this.wafAlarmsFlexConstruct = new UNSWAFAlarmsConstruct(flex, config, {
      wafName: resources.flex.wafName,
      alertTopic,
      group: flexServiceName,
    });

    this.integrationAlarmsFLEXConstruct = new UNSIntegrationAlarmsConstruct(flex, config, {
      alertTopic,
      group: flexServiceName,
      lambdas: Object.entries(resources.flex.lambdaFunctionNames)
        .filter((entry): entry is [string, string] => entry[1] !== undefined)
        .map(([name, functionName]) => ({ name, functionName })),
    });
  }
}
