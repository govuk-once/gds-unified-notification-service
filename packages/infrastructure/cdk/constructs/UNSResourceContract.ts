export interface UNSResourceContract {
  alertTopicArn: string;
  pso: {
    restApiName: string;
    wafName: string;
    queueNames: {
      incoming: string;
      processing: string;
      groupProcessing?: string;
      dispatch: string;
      analytics: string;
    };
    dlqNames: {
      incomingDlq?: string;
      processingDlq?: string;
      groupProcessingDlq?: string;
      dispatchDlq?: string;
    };
    lambdaFunctionNames: Record<string, { functionName: string; timeoutMs: number } | undefined>;
    logGroupNames: {
      postMessage: string;
      processing: string;
      dispatch: string;
      postGroupMessage?: string;
      groupProcessingWorker?: string;
    };
  };
  flex: {
    restApiName: string;
    wafName: string;
    lambdaFunctionNames: Record<string, { functionName: string; timeoutMs: number } | undefined>;
  };
}
