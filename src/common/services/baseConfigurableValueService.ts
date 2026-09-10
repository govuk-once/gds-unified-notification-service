import { ServiceMisconfigurationError } from '@common/models';
import { ObservabilityService } from '@common/services/observabilityService';
import { ParameterConfig } from '@shared/ssmParameter';
import * as z from 'zod';

export abstract class BaseConfigurableValueService {
  constructor(protected observability: ObservabilityService) {}

  // Implements value fetching logic - and string value getting
  abstract getParameter(namespace: string): Promise<string>;

  // Value parser
  public async getParameterAsType<T extends z.Schema>(
    parameter: ParameterConfig,
    schema: T,
    deserialize: boolean = true
  ): Promise<z.infer<T>> {
    const parameterValue = await this.getParameter(parameter.Path);

    // Parse parameter
    try {
      const result = schema.safeParse(deserialize ? JSON.parse(parameterValue) : parameterValue);

      // If schema processing failed
      if (result.error) {
        this.observability.logger.error(`Could not parse parameter ${parameter.Path} to type`, {
          method: 'getParameterAsType',
          error: z.prettifyError(result.error),
        });
        throw new ServiceMisconfigurationError();
      }

      // Return cast value type
      return result.data;
    } catch (error) {
      if (error instanceof ServiceMisconfigurationError) {
        throw error;
      }

      this.observability.logger.error(`Could not parse parameter ${parameter.Path} to type`, {
        method: 'getParameterAsType',
      });
      throw new ServiceMisconfigurationError();
    }
  }

  public async getBooleanParameter(parameter: ParameterConfig<'boolean'>): Promise<boolean> {
    return this.getParameterAsType(
      parameter,
      z.coerce
        .string()
        .toLowerCase()
        .refine((x) => x === 'true' || x === 'false')
        .transform((x) => x === 'true')
        .pipe(z.boolean()),
      false
    );
  }

  public async getNumericParameter(parameter: ParameterConfig<'numeric'>): Promise<number> {
    return this.getParameterAsType(
      parameter,
      z.coerce
        .string()
        .transform((value) => (value === '' ? null : value))
        .nullable()
        .refine((value) => value === null || !Number.isNaN(Number(value)), {
          message: 'Invalid number',
        })
        .transform((value) => (value === null ? null : Number(value)))
        .pipe(z.number()),
      false
    );
  }

  public async getEnumParameter<T extends z.ZodEnum>(
    parameter: ParameterConfig<'enum'>,
    schema: T
  ): Promise<z.infer<T>> {
    return await this.getParameterAsType(parameter, schema, false);
  }

  public async getStringParameter(parameter: ParameterConfig<'string'>): Promise<string> {
    return this.getParameter(parameter.Path);
  }
}
