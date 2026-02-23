import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils';
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

    // Fetch configuration
    const protocols = (await this.config.getParameter(StringParameters.Content.Allowed.Protocols)).split(',');
    const hostnames = (await this.config.getParameter(StringParameters.Content.Allowed.UrlHostnames)).split(',');

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
      // Validate protocol is on the list
      if (protocols.includes(url.protocol) == false) {
        throw this.createError(
          `${segment} is using ${url.protocol} protocol which is not allowed. Allowed protocols: ${protocols.join(',')}`
        );
      }

      // Validate hostnames for https protocols
      if (url.protocol == 'https:') {
        const validHostname = hostnames
          .map((hostname) => {
            // If hostname starts with *, strip it - then check if URLs hostname ends with it
            if (hostname.startsWith('*')) {
              return url.hostname.endsWith(hostname.replace('*', ''));
            }
            // Otherwise check for exact match
            return url.hostname == hostname;
          })
          .some((valid) => valid);

        if (validHostname == false) {
          throw this.createError(`${segment} is using ${url.hostname} hostname which is not on the allow list.`);
        }
      }
    }
    return input;
  }
}
