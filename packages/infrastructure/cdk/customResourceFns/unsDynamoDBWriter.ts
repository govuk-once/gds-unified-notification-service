import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { createHash } from 'node:crypto';

export type UNSDynamoDbWriterProps = {
  table: string;
  idAttribute: string;
  data: Record<string, string | number | boolean | object>;
};

// CloudFormation stringifies all primitives in Custom Resource properties before invoking the Lambda.
// This restores boolean and number types recursively throughout nested objects.
function coerceValue(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (typeof value === 'string' && value !== '' && !Number.isNaN(Number(value))) return Number(value);
  if (Array.isArray(value)) return value.map(coerceValue);
  if (typeof value === 'object' && value !== null) return deepCoercePrimitives(value as Record<string, unknown>);
  return value;
}

function deepCoercePrimitives(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, coerceValue(value)]));
}

export const handler = async (event: CloudFormationCustomResourceEvent<UNSDynamoDbWriterProps>) => {
  // Allow this handler to handle hashing of values, any property with suffix `ToSerializeToSha256` will be hashed, and have the suffix removed
  // This is needed due to CDK limitations of not being able to generate hashes on references
  const data: Record<string, unknown> = { ...event.ResourceProperties.data };
  for (const [key, value] of Object.entries(data)) {
    if (key.endsWith('ToSerializeToSha256')) {
      data[key.replace(`ToSerializeToSha256`, ``)] = createHash('sha256')
        .update((value as string).trim())
        .digest('hex');
      delete data[key];
    }
  }
  // Recursively restore booleans and numbers that CloudFormation converted to strings
  Object.assign(data, deepCoercePrimitives(data));

  // Dont delete records, mark them as deleted instead & update the values
  data['Deleted'] = event.RequestType === 'Delete';

  switch (event.RequestType) {
    case 'Create':
      await new DynamoDB({}).putItem({
        TableName: event.ResourceProperties.table,
        Item: marshall(data, { removeUndefinedValues: true }),
      });
      break;
    case 'Update':
    case 'Delete': {
      const entries = Object.entries(data).filter(
        ([key, value]) => ![event.ResourceProperties.idAttribute].includes(key) && value != undefined
      );

      const names = Object.fromEntries(entries.map(([k]) => [`#${k}`, k]));
      const values = marshall(Object.fromEntries(entries.map(([key, value]) => [`:${key}`, value])), {});
      await new DynamoDB({}).updateItem({
        TableName: event.ResourceProperties.table,
        Key: marshall(
          {
            [event.ResourceProperties.idAttribute]: data[event.ResourceProperties.idAttribute],
          },
          { removeUndefinedValues: true }
        ),
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        UpdateExpression: 'set ' + entries.map(([key]) => `#${key} = :${key}`).join(', '),
      });
    }
  }

  // Return the generated PEM structural block back up to the CDK pipeline stack evaluation
  return {
    PhysicalResourceId: event.LogicalResourceId ?? 'unknown',
    Data: {},
  };
};
