import { ITypedAPIGatewayRequestAuthorizerEvent } from '@common/middlewares/interfaces/ITypedAPIGatewayRequestAuthorizerEvent';
import { APIGatewayEvent, APIGatewayProxyEventV2 } from 'aws-lambda';

export type IRequestEvent<A = never> = APIGatewayEvent &
  APIGatewayProxyEventV2 &
  ITypedAPIGatewayRequestAuthorizerEvent<A>;
