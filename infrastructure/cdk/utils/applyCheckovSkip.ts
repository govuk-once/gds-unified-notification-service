import { CfnResource } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';

export function applyCheckovSkips(construct: IConstruct, skips: [string, string][]) {
  const resource = construct instanceof CfnResource ? construct : (construct.node.defaultChild as CfnResource);
  resource.addMetadata('checkov', { skip: skips.map(([id, comment]) => ({ id, comment })) });
  return construct;
}
