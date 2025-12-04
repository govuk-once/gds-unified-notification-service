import type { APIGatewayEvent, APIGatewayProxyEventV2 } from 'aws-lambda';

export type IRequestEvent = APIGatewayEvent & APIGatewayProxyEventV2;
