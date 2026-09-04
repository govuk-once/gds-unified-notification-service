export interface UNSResourceContract {
  alertTopicArn: string;
  pso: {
    restApiName: string;
    wafName: string;
    queueNames: {
      incoming: string;
      processing: string;
      dispatch: string;
      analytics: string;
    };
    lambdaFunctionNames: Record<string, string | undefined>;
  };
  flex: {
    restApiName: string;
    wafName: string;
    lambdaFunctionNames: Record<string, string | undefined>;
  };
}
