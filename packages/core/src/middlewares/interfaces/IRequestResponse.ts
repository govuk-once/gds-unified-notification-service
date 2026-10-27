import type { APIGatewayProxyResult, APIGatewayProxyResultV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

export type IRequestResponse = APIGatewayProxyStructuredResultV2 & APIGatewayProxyResultV2 & APIGatewayProxyResult;
