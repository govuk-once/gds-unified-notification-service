import type { APIGatewayAuthorizerEvent, APIGatewayEvent, APIGatewayProxyEventV2 } from 'aws-lambda';

export type IRequestEvent = APIGatewayEvent & APIGatewayProxyEventV2 & APIGatewayAuthorizerEvent;
