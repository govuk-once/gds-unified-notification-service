import { CfnResource } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';

export function applyCheckovSkips(construct: IConstruct, skips: [string, string][]) {
  const resource = construct instanceof CfnResource ? construct : (construct.node.defaultChild as CfnResource);
  if (resource?.getMetadata == undefined) {
    return;
  }
  const checkovMetadata = resource.getMetadata('checkov') as undefined | { skip?: [string, string][] };
  const previousSkips = checkovMetadata?.skip ?? [];

  resource.addMetadata('checkov', { skip: [...previousSkips, ...skips.map(([id, comment]) => ({ id, comment }))] });
  return construct;
}

export function applyCheckovSkipsRecursive(construct: IConstruct, skips: [string, string][]) {
  // Apply skips directly
  applyCheckovSkips(construct, skips);

  // Apply skips to descendants
  for (const child of construct.node.children) {
    applyCheckovSkipsRecursive(child, skips);
  }
}
