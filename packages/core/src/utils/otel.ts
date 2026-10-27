import { Tracer } from '@aws-lambda-powertools/tracer';
import type { Subsegment } from 'aws-xray-sdk-core';

export const segment = async <T = void>(tracer: Tracer, name: string, fn: (segment: Subsegment) => Promise<T> | T) => {
  // Open new segment
  const segment = tracer.getSegment()?.addNewSubsegment(name);
  if (segment == undefined) {
    throw new Error(`Failed to initialize segment: ${name}`);
  }
  tracer.setSegment(segment);
  try {
    // Execute fn
    const result = await fn(segment);

    // Wrap segment
    segment.close();
    tracer.setSegment(segment.parent);
    return result;
  } catch (e) {
    // Log error and close current segment
    if (e instanceof Error) {
      segment.addError(e);
    }
    segment.close();
    tracer.setSegment(segment.parent);

    // Re-throw error
    throw e;
  }
};
