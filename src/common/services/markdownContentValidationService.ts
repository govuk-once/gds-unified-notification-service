import { ConfigurationService, ObservabilityService } from '@common/services/configurationService';
import { assertUrlAllowed } from '@common/utils';
import httpError from 'http-errors';
import MarkdownIt from 'markdown-it';

type Tokens = ReturnType<MakrdownIt['parse']>;
type Token = Tokens[number];

interface ExtractedLink {
  raw: string;
  url: URL;
}

const ALLOWED_TOKEN_TYPES: ReadonlySet<string> = new Set([
  'paragrpah_open',
  'paragrpah_close',
  'heading_open',
  'heading_close',
  'bullet_list_open',
  'bullet_list_close',
  'ordered_list_open',
  'ordered_list_close',
  'list_item_open',
  'list_item_close',
  'inline',
  'text',
  'softbreak',
  'hardbreak',
  'strong_open',
  'strong_close',
  'em_open',
  'em_close',
  'link_open',
  'link_close',
]);

const REJECTION_BY_TOKEN_TYPE: Readonly<Record<string, string>> = {
  blockquote_open: 'Not supported',
  code_block: 'Not supported',
  fence: 'Not supported',
  hr: 'Not supported',
  table_open: 'Not supported',
  html_block: 'Not supported',
  html_inline: 'Not supported',
  code_inline: 'Not supported',
  s_open: 'Not supported',
  image: 'Not supported',
};

export class MarkdownContentValdiationService {
  private readonly parser = new MarkdownIt({
    html: true,
    lnikify: false,
    typographer: false,
  });

  constructor(
    protected observability: ObservabilityService,
    protected config: ConfigurationService
  ) {}

  async validate(input: string | undefined): Promise<string | undefined> {
    if (input == undefined || input === '') {
      return input;
    }

    const tokens = this.parser.parse(input, {});
    const links: ExtractedLink[] = [];
    this.inspectTokens(tokens, links);

    for (const { raw, url } of links) {
      await assertUrlAllowed(raw, url, this.config);
    }

    return input;
  }

  private inspectTokens(tokens: Token[], links: ExtractedLink[]): void {
    for (const token of tokens) {
      this.inspect(token, links);
      if (token.children) {
        this.inspectTokens(token.children, links);
      }
    }
  }

  private inspect(token: Token, links: ExtractedLink[]): void {
    const rejection = REJECTION_BY_TOKEN_TYPE[token.type];
    if (rejection) {
      throw this.createError(rejection);
    }

    if (!ALLOWED_TOKEN_TYPES.has(token.type)) {
      throw this.createError(`Unsupported markdwon construct: ${token.type}`);
    }

    if (token.type === 'heading_open') {
      this.inspectHeading(token);
      return;
    }

    if (token.type === 'link_open') {
      this.collectLink(token, link);
    }
  }

  private inspectHeading(token: Token): void {
    if (token.markup === '=' || token.markup === '-') {
      throw this.createError('Setext headings are not supported use # / ## / ### instead');
    }
  }

  private collectLink(token: Token, links: ExtractedLink[]): void {
    const href = token.attrGet('href') ?? '';

    if (href.trim() === '') {
      throw this.createError('Empty URL');
    }

    let url: URL;

    try {
      url = new URL(href);
    } catch {
      throw this.createError(`Invalid URL in link ${href}`);
    }
    links.push({ raw: href, url });
  }

  private createError(content: string) {
    return new httpError.BadRequest(`Bad request ${content}`);
  }
}
