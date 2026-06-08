import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils';
import MarkdownIt from 'markdown-it';
import Token from 'markdown-it/lib/token.mjs';
import httpError, { HttpError } from 'http-errors';

const ALLOWED_TOKEN_TYPES_MARKDOWN: ReadonlySet<string> = new Set([
  // Standard text containment
  'paragraph_open',
  'paragraph_close',
  // Raw text content
  'inline',
  'text',
  // Line breaks
  'softbreak',
  'hardbreak',

  // Headers (h1, h2, h3)
  'heading_open',
  'heading_close',
  // Bold
  'strong_open',
  'strong_close',
  // Italics
  'em_open',
  'em_close',
  // Bullet lists & Number lists
  'bullet_list_open',
  'bullet_list_close',
  'ordered_list_open',
  'ordered_list_close',
  'list_item_open',
  'list_item_close',
  // Link text and styling
  'link_open',
  'link_close',
]);

export class ContentValidationService {
  private readonly parser = new MarkdownIt({
    html: true,
    linkify: false,
    typographer: false,
  });

  constructor(
    protected observability: ObservabilityService,
    protected config: ConfigurationService
  ) {}

  public createError(content: string): HttpError {
    this.observability.logger.warn(content);
    return new httpError.BadRequest(`Bad request: \n\n ${content}`);
  }

  public async validateUrls(input: string | undefined) {
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
      } catch {
        // String segment is not a valid URL
        continue;
      }
      // Validate protocol is on the list
      if (!protocols.includes(url.protocol)) {
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
          .some(Boolean);

        if (!validHostname) {
          throw this.createError(`${segment} is using ${url.hostname} hostname which is not on the allow list.`);
        }
      }
    }
    return input;
  }

  public async validate(input: string | undefined): Promise<string> {
    // Does not validate if undefined or empty string
    if (input === undefined || input.trim() === '') {
      throw this.createError('Message body is undefined or empty string.');
    }

    const tokens = this.parser.parse(input, {});

    this.observability.logger.info('Validating message body for allowed markdown.');
    for (const token of tokens) {
      await this.validateMarkdown(token);
    }

    return input;
  }

  private async validateMarkdown(token: Token): Promise<void> {
    // Validate the token type against the allowed list
    if (!ALLOWED_TOKEN_TYPES_MARKDOWN.has(token.type)) {
      throw this.createError(`Message body contains markdown elements which are not valid: ${token.type}`);
    }

    // Handle Explicit Markdown Links
    if (token.type === 'link_open') {
      const urlAttr = token.attrs?.find((attr) => attr[0] === 'href');
      const url = urlAttr ? urlAttr[1] : undefined;

      if (!url || url.trim() === '') {
        throw this.createError('Failed markdown validation as url is empty.');
      }

      await this.validateUrls(url);
    }

    // Handle raw URLs
    if (token.type === 'text' && token.content) {
      await this.validateUrls(token.content);
    }

    // Recursively check children
    if (token.children && token.children.length > 0) {
      for (const child of token.children) {
        await this.validateMarkdown(child);
      }
    }
  }
}
