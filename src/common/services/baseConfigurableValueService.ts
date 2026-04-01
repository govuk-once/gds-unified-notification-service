import { ObservabilityService } from '@common/services/observabilityService';
import * as z from 'zod';

export abstract class BaseConfigurableValueService {
  constructor(protected observability: ObservabilityService) {}

  // Implements value fetching logic - and string value getting
  abstract getParameter(namespace: string): Promise<string>;

  // Value parser
  public async getParameterAsType<T extends z.Schema>(
    namespace: string,
    schema: T,
    deserialize: boolean = true
  ): Promise<z.infer<T>> {
    const parameterValue = await this.getParameter(namespace);
    // Parse parameter
    try {
      const result = schema.safeParse(deserialize ? JSON.parse(parameterValue) : parameterValue);

      // If schema processing failed
      if (result.error) {
        const errorMsg = `Could not parse parameter ${namespace} to type`;
        this.observability.logger.error(errorMsg, {
          method: 'getParameterAsType',
          error: z.prettifyError(result.error),
        });
        throw new Error(errorMsg);
      }

      // Return cast value type
      return result.data as z.infer<T>;
    } catch {
      const errorMsg = `Could not parse parameter ${namespace} to type`;
      this.observability.logger.error(errorMsg, {
        method: 'getParameterAsType',
      });
      throw new Error(errorMsg);
    }
  }

  public async getBooleanParameter(namespace: string): Promise<boolean> {
    return this.getParameterAsType(
      namespace,
      z.coerce
        .string()
        .toLowerCase()
        .refine((x) => x === 'true' || x === 'false')
        .transform((x) => x === 'true')
        .pipe(z.boolean()),
      false
    );
  }

  public async getNumericParameter(namespace: string): Promise<number> {
    return this.getParameterAsType(
      namespace,
      z.coerce
        .string()
        .transform((value) => (value === '' ? null : value))
        .nullable()
        .refine((value) => value === null || !isNaN(Number(value)), {
          message: 'Invalid number',
        })
        .transform((value) => (value === null ? null : Number(value)))
        .pipe(z.number()),
      false
    );
  }

  public async getEnumParameter<T extends z.ZodEnum>(namespace: string, schema: T): Promise<z.infer<T>> {
    return await this.getParameterAsType(namespace, schema, false);
  }
}
