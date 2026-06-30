import { ContentValidationError } from '@common/models/Errors/BadRequestError';
import { ConfigurationService, ObservabilityService } from '@common/services';
import MarkdownIt from 'markdown-it';
import Token from 'markdown-it/lib/token.mjs';

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
    protected config: ConfigurationService,
    private readonly protocols: string[],
    private readonly hostnames: string[],
  ) {}

  private createError(content: string) {
    return new ContentValidationError([content]);
  }

  public validate(input: string | undefined): string {
    // Does not validate if undefined or empty string
    if (input === undefined || input.trim() === '') {
      throw this.createError('Message body is undefined or empty string.');
    }

    const tokens = this.parser.parse(input, {});

    this.observability.logger.info('Validating message body for allowed markdown.');
    for (const token of tokens) {
      this.validateMarkdown(token);
    }

    return input;
  }

  private validateUrls(input: string | undefined) {
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
      } catch {
        // String segment is not a valid URL
        continue;
      }
      // Validate protocol is on the list
      if (this.protocols.includes(url.protocol) == false) {
        throw this.createError(
          `${segment} is using ${url.protocol} protocol which is not allowed. Allowed protocols: ${this.protocols.join(',')}`
        );
      }

      // Validate hostnames for https protocols
      if (url.protocol == 'https:') {
        const validHostname = this.hostnames
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
          throw this.createError(`${segment} is using ${url.hostname} hostname which is not on the allow list`);
        }
      }
    }
    return input;
  }

  private validateMarkdown(token: Token) {
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

      this.validateUrls(url);
    }

    // Handle raw URLs
    if (token.type === 'text' && token.content) {
      this.validateUrls(token.content);
    }

    // Recursively check children
    if (token.children && token.children.length > 0) {
      for (const child of token.children) {
        this.validateMarkdown(child);
      }
    }
  }
}
