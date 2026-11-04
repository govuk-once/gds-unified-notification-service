/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
import { CustomMatcher } from 'aws-sdk-client-mock-vitest';
import 'vitest';

declare module 'vitest' {
  interface Matchers<T = any> extends CustomMatcher<T> {}
}
