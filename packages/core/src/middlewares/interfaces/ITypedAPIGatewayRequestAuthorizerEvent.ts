import { APIGatewayEventRequestContextWithAuthorizer, APIGatewayRequestAuthorizerEvent } from 'aws-lambda';

export type ITypedAPIGatewayRequestAuthorizerEvent<A = never> = Omit<
  APIGatewayRequestAuthorizerEvent,
  'requestContext'
> & {
  requestContext: APIGatewayEventRequestContextWithAuthorizer<A>;
};
