import { ServiceMisconfigurationError } from '@common/models';
import { ObservabilityService } from '@common/services/observabilityService';
import { ParameterConfig } from '@shared/ssmParameter';
import z, { ZodEnum, ZodType } from 'zod';

export abstract class BaseConfigurableValueService {
  constructor(protected observability: ObservabilityService) {}

  // Implements value fetching logic - and string value getting
  protected abstract getParameterRawValue(namespace: string): Promise<string>;

  // Value parser
  protected async getParameterAsType<T extends ZodType>(
    parameter: ParameterConfig,
    schema: T,
    deserialize: boolean = true
  ): Promise<z.infer<T>> {
    const parameterValue = await this.getParameterRawValue(parameter.Path);

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

  protected async getBooleanParameter(parameter: ParameterConfig): Promise<boolean> {
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

  protected async getNumericParameter(parameter: ParameterConfig): Promise<number> {
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

  protected async getStringParameter(parameter: ParameterConfig): Promise<string> {
    return this.getParameterRawValue(parameter.Path);
  }

  public async getParameter(parameter: ParameterConfig<'boolean'>): Promise<boolean>;
  public async getParameter(parameter: ParameterConfig<'numeric'>): Promise<number>;
  public async getParameter(parameter: ParameterConfig<'string'>): Promise<string>;
  public async getParameter<T extends ZodEnum>(parameter: ParameterConfig<'enum'>, schema: T): Promise<z.infer<T>>;
  public async getParameter<T extends ZodType>(
    parameter: ParameterConfig<'json'>,
    schema: T,
    deserialize?: boolean
  ): Promise<z.infer<T>>;
  public async getParameter(parameter: ParameterConfig, schema?: ZodType, deserialize?: boolean) {
    switch (parameter.Type) {
      case 'boolean':
        return this.getBooleanParameter(parameter);
      case 'numeric':
        return this.getNumericParameter(parameter);
      case 'string':
        return this.getStringParameter(parameter);
      case 'enum':
        return this.getParameterAsType(parameter, schema!, false);
      case 'json':
        return this.getParameterAsType(parameter, schema!, deserialize);
    }
  }
}
