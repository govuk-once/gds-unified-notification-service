import { Stack, StackProps } from 'aws-cdk-lib';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { EnvVars } from '@infra/cdk/config';
import { UNSApiGatewayAlarmsConstruct } from '@infra/cdk/constructs/alarmsConstructs/UNSApiGatewayAlarmsConstruct';
import { UNSAuthenticationAlarmsConstruct } from '@infra/cdk/constructs/alarmsConstructs/UNSAuthenticationAlarmsConstruct';
import { UNSIntegrationAlarmsConstruct } from '@infra/cdk/constructs/alarmsConstructs/UNSIntegrationAlarmsConstruct';
import { UNSOperationalAlarmsConstruct } from '@infra/cdk/constructs/alarmsConstructs/UNSOperationalAlarmsConstruct';
import { UNSPerformanceAlarmsConstructs } from '@infra/cdk/constructs/alarmsConstructs/UNSPerformanceAlarmsConstructs';
import { UNSWAFAlarmsConstruct } from '@infra/cdk/constructs/alarmsConstructs/UNSWAFAlarmsConstructs';
import { UNSSecurityAlarmsConstruct } from '@infra/cdk/constructs/alarmsConstructs/UNSSecurityAlarmsConstruct';
import { UNSResourceContract } from '@infra/cdk/constructs/UNSResourceContract';
import { UNSPSOFlow } from '@infra/cdk/constructs/dashboards/UNSPSOFlow';
import { UNSPSOGroupFlow } from '@infra/cdk/constructs/dashboards/UNSPSOGroupsFlow';
import { UNSPSOUtilization } from '@infra/cdk/constructs/dashboards/UNSPSOUtilization';
import { ProviderDimension } from '@common/services';

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

  public readonly securityAlarmsPSOConstruct: UNSSecurityAlarmsConstruct;
  public readonly securityAlarmsFLEXConstruct: UNSSecurityAlarmsConstruct;

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
      dlqs: Object.entries(resources.pso.dlqNames)
        .filter((d) => d[1] !== undefined)
        .map(([name, queueName]) => ({ name, queueName })),
    });

    const psoLambdas = resources.pso.lambdaFunctionNames;

    this.performanceAlarmsConstructs = new UNSPerformanceAlarmsConstructs(pso, config, {
      lambdas: Object.entries(psoLambdas)
        .filter((entry): entry is [string, { functionName: string; timeoutMs: number }] => entry[1] !== undefined)
        .filter(([name]) => !['postGroupMessage', 'groupProcessingWorker', 'analytics'].includes(name))
        .map(([name, { functionName }]) => ({ name, functionName })),
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
        .filter((entry): entry is [string, { functionName: string; timeoutMs: number }] => entry[1] !== undefined)
        .map(([name, { functionName }]) => ({ name, functionName })),
    });

    // PSO security alarms: Lambda throttling, timeout proximity, concurrency anomaly, IAM AccessDenied,
    // and unqualified Lambda invocation. includeAccountScopedAlarms is set here (PSO) only — these
    // are account-level detections routed via EventBridge, not per-service.
    this.securityAlarmsPSOConstruct = new UNSSecurityAlarmsConstruct(pso, config, {
      alertTopic,
      group: psoServiceName,
      lambdas: Object.entries(psoLambdas)
        .filter((entry): entry is [string, { functionName: string; timeoutMs: number }] => entry[1] !== undefined)
        .map(([name, { functionName, timeoutMs }]) => ({ name, functionName, timeoutMs })),
      includeAccountScopedAlarms: true,
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
        .filter((entry): entry is [string, { functionName: string; timeoutMs: number }] => entry[1] !== undefined)
        .map(([name, { functionName }]) => ({ name, functionName })),
    });

    // Flex security alarms: Lambda throttling, timeout proximity, and concurrency anomaly only.
    // Account-scoped alarms (IAM AccessDenied, unqualified invocation) are created by the PSO construct.
    this.securityAlarmsFLEXConstruct = new UNSSecurityAlarmsConstruct(flex, config, {
      alertTopic,
      group: flexServiceName,
      lambdas: Object.entries(resources.flex.lambdaFunctionNames)
        .filter((entry): entry is [string, { functionName: string; timeoutMs: number }] => entry[1] !== undefined)
        .map(([name, { functionName, timeoutMs }]) => ({ name, functionName, timeoutMs })),
    });

    //// =====================================================
    // Dashboards
    //// =====================================================

    new UNSPSOFlow(this, 'pso-flow-dashboards', config, {
      wafName: resources.pso.wafName,
      incomingQueueName: resources.pso.queueNames.incoming,
      dispatchQueueName: resources.pso.queueNames.dispatch,
      restApiName: resources.pso.restApiName,
      processingFunctionName: resources.pso.lambdaFunctionNames.processing!.functionName,
      dispatchFunctionName: resources.pso.lambdaFunctionNames.dispatch!.functionName,
      postMessageLogGroupName: resources.pso.logGroupNames.postMessage,
      processingLogGroupName: resources.pso.logGroupNames.processing,
      dispatchLogGroupName: resources.pso.logGroupNames.dispatch,
    });

    new UNSPSOUtilization(this, 'pso-utilization-dashboards', config, {
      restApiName: resources.pso.restApiName,
    });

    if (resources.pso.logGroupNames.postGroupMessage !== undefined) {
      new UNSPSOGroupFlow(this, 'pso-group-flow-dashboards', config, {
        postGroupMessageLogGroupName: resources.pso.logGroupNames.postGroupMessage,
        groupProcessingWorkerLogGroupName: resources.pso.logGroupNames.groupProcessingWorker,
      });
    }
  }
}
