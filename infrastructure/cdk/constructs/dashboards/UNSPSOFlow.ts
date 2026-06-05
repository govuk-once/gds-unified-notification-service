import { Stack } from 'aws-cdk-lib';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import { EnvVars } from 'infrastructure/cdk/config';
import { UNSPSOResource } from 'infrastructure/cdk/constructs/UNSPSOResources';

export class UNSPSOFlow extends Construct {
  constructor(scope: Construct, id: string, config: EnvVars, refs: { pso: UNSPSOResource }) {
    super(scope, id);
    const stack = Stack.of(this);

    // TODO: Refactor to use proper widget defintions, this is just initial TF migration 1:1
    const rawDashboard = {
      widgets: [
        {
          type: 'metric',
          x: 6,
          y: 0,
          width: 6,
          height: 6,
          properties: {
            metrics: [
              [
                'AWS/SQS',
                'NumberOfMessagesSent',
                'QueueName',
                refs?.pso.queues.incoming.queue.queueName,
                {
                  region: config.region,
                },
              ],
              [
                '.',
                'NumberOfMessagesReceived',
                '.',
                '.',
                {
                  region: config.region,
                },
              ],
              [
                '.',
                'ApproximateNumberOfMessagesVisible',
                '.',
                '.',
                {
                  label: 'Queue Depth',
                  region: config.region,
                },
              ],
            ],
            view: 'timeSeries',
            stacked: false,
            region: config.region,
            stat: 'Sum',
            period: 1,
            title: 'Processing Queue',
            liveData: true,
          },
        },
        {
          type: 'metric',
          x: 6,
          y: 6,
          width: 6,
          height: 6,
          properties: {
            metrics: [
              [
                'AWS/Lambda',
                'Invocations',
                'FunctionName',
                refs?.pso.lambdas.sqs.processing.fn.functionName,
                {
                  region: config.region,
                },
              ],
              [
                '.',
                'Errors',
                '.',
                '.',
                {
                  region: config.region,
                },
              ],
            ],
            view: 'timeSeries',
            stacked: false,
            region: config.region,
            period: 1,
            stat: 'Sum',
            title: 'Notifications Processed',
            liveData: true,
          },
        },
        {
          type: 'metric',
          x: 12,
          y: 0,
          width: 6,
          height: 6,
          properties: {
            metrics: [
              [
                'AWS/SQS',
                'NumberOfMessagesSent',
                'QueueName',

                refs?.pso.queues.dispatch.queue.queueName,
                {
                  region: config.region,
                },
              ],
              [
                '.',
                'NumberOfMessagesReceived',
                '.',
                '.',
                {
                  region: config.region,
                },
              ],
              [
                '.',
                'ApproximateNumberOfMessagesVisible',
                '.',
                '.',
                {
                  label: 'Queue Depth',
                  region: config.region,
                },
              ],
            ],
            view: 'timeSeries',
            stacked: false,
            region: config.region,
            stat: 'Sum',
            period: 1,
            title: 'Dispatch Queue',
            liveData: true,
          },
        },
        {
          type: 'metric',
          x: 12,
          y: 6,
          width: 6,
          height: 6,
          properties: {
            metrics: [
              [
                'AWS/Lambda',
                'Invocations',
                'FunctionName',
                refs?.pso.lambdas.sqs.dispatch.fn.functionName,
                {
                  region: config.region,
                },
              ],
              [
                '.',
                'Errors',
                '.',
                '.',
                {
                  region: config.region,
                },
              ],
            ],
            view: 'timeSeries',
            stacked: false,
            region: config.region,
            period: 1,
            stat: 'Sum',
            title: 'Notifications Dispatched',
            liveData: true,
          },
        },
        {
          type: 'metric',
          x: 0,
          y: 0,
          width: 6,
          height: 6,
          properties: {
            metrics: [
              [
                'AWS/WAFV2',
                'BlockedRequests',
                'WebACL',
                refs?.pso.gateway.waf.name,
                'Region',
                config.region,
                'Rule',
                'ALL',
                {
                  region: config.region,
                  color: '#d62728',
                },
              ],
              [
                '.',
                'AllowedRequests',
                '.',
                '.',
                '.',
                '.',
                '.',
                '.',
                {
                  region: config.region,
                  color: '#2ca02c',
                },
              ],
            ],
            view: 'timeSeries',
            stacked: true,
            region: config.region,
            stat: 'Sum',
            period: 1,
            title: 'Web App Firewall per Second',
          },
        },
        {
          type: 'metric',
          x: 18,
          y: 0,
          width: 5,
          height: 6,
          properties: {
            metrics: [
              [
                'global',
                'SentToOneSignalComplete',
                {
                  region: config.region,
                  label: 'Accepted',
                },
              ],
            ],
            view: 'timeSeries',
            stacked: true,
            region: config.region,
            stat: 'Sum',
            period: 1,
            title: 'Sent to OneSignal per Second',
          },
        },
        {
          type: 'metric',
          x: 0,
          y: 6,
          width: 6,
          height: 6,
          properties: {
            metrics: [
              [
                {
                  expression: 'm3-m1-m2',
                  label: '2xx Reponse',
                  id: 'e1',
                  color: '#9467bd',
                },
              ],
              [
                'AWS/ApiGateway',
                '4XXError',
                'ApiName',
                refs?.pso.gateway.restApi.restApiName,
                {
                  region: config.region,
                  id: 'm1',
                  label: '4XX Error',
                },
              ],
              [
                '.',
                '5XXError',
                '.',
                '.',
                {
                  region: config.region,
                  id: 'm2',
                  label: '5XX Error',
                  color: '#d62728',
                },
              ],
              [
                '.',
                'Count',
                '.',
                '.',
                {
                  region: config.region,
                  id: 'm3',
                  label: 'Incoming',
                  color: '#2ca02c',
                },
              ],
            ],
            view: 'timeSeries',
            stacked: true,
            region: config.region,
            stat: 'Sum',
            period: 1,
            title: 'API per Second',
          },
        },
      ],
    };

    new cw.CfnDashboard(this, 'dashboard', {
      dashboardName: config.utils.namingHelper(id),
      dashboardBody: stack.toJsonString(rawDashboard),
    });
  }
}
