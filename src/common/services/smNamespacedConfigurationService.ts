import { ObservabilityService } from '@common/services/observabilityService';
import { SMConfigurationService } from '@common/services/smConfigurationService';

export class SMNamespacedConfigurationService extends SMConfigurationService {
  protected prefix = process.env.PREFIX;

  constructor(protected observability: ObservabilityService) {
    super(observability);
  }

  public async getParameter(secretId: string): Promise<string> {
    return await super.getParameter(`${this.prefix}/${secretId}`)
  }
}
