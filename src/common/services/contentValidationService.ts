import { ConfigurationService, ObservabilityService } from '@common/services';
import { StringParameters } from '@common/utils';
import MarkdownIt from 'markdown-it';
import Token from 'markdown-it/lib/token.mjs';
import httpError from 'http-errors';
import { MessageFormatEnum } from '@common/models/MessageFormatEnum';

const ALLOWED_TOKEN_TYPES_PLAINTEXT: ReadonlySet<string> = new Set([
  // Standard text containment
  'paragraph_open',
  'paragraph_close',
  // Raw text content
  'inline',
  'text',
  // Line breaks
  'softbreak',
  'hardbreak',
]);

const ALLOWED_TOKEN_TYPES_MARKDOWN: ReadonlySet<string> = new Set([
  ...ALLOWED_TOKEN_TYPES_PLAINTEXT,
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

  public createError(content: string): never {
    this.observability.logger.warn(content);
    throw new httpError.BadRequest(`Bad request: \n\n ${content}`);
  }

  public async validate(input: string | undefined) {
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
        this.createError(
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
          this.createError(`${segment} is using ${url.hostname} hostname which is not on the allow list.`);
        }
      }
    }
    return input;
  }

  public async validateWithMessageFormat(input: string | undefined, messageFormat: MessageFormatEnum): Promise<string> {
    // Does not validate if undefined or empty string
    if (input === undefined || input.trim() === '') {
      this.createError('Message body is undefined or empty string.');
    }

    const tokens = this.parser.parse(input, {});

    if (messageFormat === MessageFormatEnum.PLAINTEXT) {
      this.observability.logger.info('Validating message body for plain text.');
      await this.validateContentAsPlainText(tokens);
      await this.validate(input);
      return input;
    }

    if (messageFormat === MessageFormatEnum.MARKDOWN) {
      this.observability.logger.info('Validating message body for allowed markdown.');
      await this.validateContentAsMarkdownText(tokens);
      return input;
    }

    this.observability.logger.error('MessageFormatEnum type was not implemented for this function.');
    throw new httpError.BadRequest('Bad Request');
  }

  private async validateContentAsPlainText(tokens: Token[]): Promise<void> {
    for (const token of tokens) {
      // Validates the token types against the allowed list, returns false if validation is failed.
      if (!ALLOWED_TOKEN_TYPES_PLAINTEXT.has(token.type)) {
        this.createError(`${token.info} has unsupported markdown as plain text.`);
      }

      // Validates the types of children of the token recursively against the allowed list, returns false if validation is failed.
      if (token.children) {
        return this.validateContentAsPlainText(token.children);
      }
    }
  }

  private async validateContentAsMarkdownText(tokens: Token[]) {
    for (const token of tokens) {
      // Validates the token types against the allowed list, returns false if validation is failed.
      if (!ALLOWED_TOKEN_TYPES_MARKDOWN.has(token.type)) {
        this.createError(`${token.info} has unsupported markdown as plain text.`);
      }

      // Dedicated detection of a markdown link
      await this.validateMarkdownLink(token);

      // Validates the types of children of the token recursively against the allowed list, returns false if validation is failed.
      if (token.children) {
        await this.validateContentAsMarkdownText(token.children);
      }
    }
  }

  private async validateMarkdownLink(token: Token) {
    if (token.type === 'link_open') {
      // Extract the URL from the markdown attributes
      const urlAttr = token.attrs?.find((attr) => attr[0] === 'href');
      const url = urlAttr ? urlAttr[1] : undefined;

      // Check the url is not empty
      if (!url || url.trim() === '') {
        this.createError('Failed markdown validation as url is empty.');
      }

      // Validate the URL specifically
      await this.validate(url);
    }
  }
}
