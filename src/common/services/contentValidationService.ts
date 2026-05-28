import { ConfigurationService, ObservabilityService } from '@common/services';
import { assertUrlAllowed } from '@common/utils/urlAllowList';
import httpError from 'http-errors';

export class ContentValidationService {
  constructor(
    protected observability: ObservabilityService,
    protected config: ConfigurationService
  ) {}

  private createError(content: string) {
    return new httpError.BadRequest(`Bad request: \n\n ${content}`);
  }

  async validate(input: string | undefined) {
    if (input == undefined || input == '') {
      return input;
    }

    // Split string by whitespace
    const segments = input.split(/(\s+)/);

    for (const segment of segments) {
      // Attempt parsing string as a URL
      let url: URL;
      try {
        url = new URL(segment);
      } catch (_) {
        // String segment is not a valid URL
        continue;
      }

      await assertUrlAllowed(segment, url, this.config);
    }
    return input;
  }
}
