import { ConfigurationService } from '@common/services/configurationService';
import { ContentValidationService } from '@common/services/contentValidationService';
import {
  mockDefaultConfig,
  mockGetParameterImplementation,
} from '@common/utils/mockConfigurationImplementation.test.util';
import { observabilitySpies } from '@common/utils/mockInstanceFactory.test.util';
import httpError from 'http-errors';

vi.mock('@aws-lambda-powertools/logger', { spy: true });
vi.mock('@aws-lambda-powertools/metrics', { spy: true });
vi.mock('@aws-lambda-powertools/tracer', { spy: true });
vi.mock('@common/services/configurationService', { spy: true });

describe('ContentValidationService', () => {
  let instance: ContentValidationService;

  // Observability and Service mocks
  const observabilityMock = observabilitySpies();
  const configurationServiceMock = vi.mocked(new ConfigurationService(observabilityMock));

  // Mocking implementation of the configuration service
  let mockParameterStore = mockDefaultConfig();

  const expectedError = (content: string) => {
    return httpError.BadRequest(`Bad Request: \n\n ${content}`);
  };

  beforeEach(() => {
    // Reset all mock
    vi.clearAllMocks();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    configurationServiceMock.getParameter.mockImplementation(mockGetParameterImplementation(mockParameterStore));

    instance = new ContentValidationService(observabilityMock, configurationServiceMock);
  });

  describe(`validateUrls`, () => {
    describe(`Valid scenarios`, () => {
      it.each([
        [`Message mentioning https://content.gov.uk val`],
        [`Deeplink to any other part of app govuk://home`],
        ['Message without a deeplink'],
        [undefined],
      ])("Content '%s' should be allowed", async (content: string | undefined) => {
        // Arrange & Act
        const result = await instance.validateUrls(content);

        // Assert
        expect(result).toEqual(content);
      });
    });

    describe('Protocol validation', () => {
      it.each([
        [
          `Some message mentioning http://unexpected-website.com amongst other things`,
          `http://unexpected-website.com is using http: protocol which is not allowed. Allowed protocols: govuk:,https:`,
        ],
        [
          `Example scam message trying to open banking apps bankapp://send`,
          `bankapp://send is using bankapp: protocol which is not allowed. Allowed protocols: govuk:,https:`,
        ],
        [
          `mailto:name@email.com`,
          `mailto:name@email.com is using mailto: protocol which is not allowed. Allowed protocols: govuk:,https:`,
        ],
      ])('Content %s should error with %s', async (content: string, errorMessage: string) => {
        // Arrange
        const exception = expectedError(errorMessage);

        // Act & Assert
        await expect(instance.validateUrls(content)).rejects.toThrow(exception);
      });

      describe('Hostname validation', () => {
        it.each([
          [
            `Some message mentioning https://unexpected-website.com amongst other things`,
            `https://unexpected-website.com is using unexpected-website.com hostname which is not on the allow list.`,
          ],
          [
            `https://www.anothernongovwebsite.net`,
            `https://www.anothernongovwebsite.net is using www.anothernongovwebsite.net hostname which is not on the allow list.`,
          ],
        ])('Content %s should error with %s', async (content: string, errorMessage: string) => {
          // Arrange
          const exception = expectedError(errorMessage);

          // Act
          const result = instance.validateUrls(content);

          // Act & Assert
          await expect(result).rejects.toThrow(exception);
        });
      });
    });
  });

  describe('validate', () => {
    it.each([
      ['# Heading 1\n## Heading 2\n### Heading 3', 'Standard ATX Headers'],
      ['This is a long title\n====================', 'Setext H1 Header'],
      ['Subheading One\n--------------', 'Setext H2 Header'],
      ['This contains **bold text** and __more bold__.', 'Bold styling'],
      ['This contains *italic text* and _more italics_.', 'Italics styling'],
      ['* Item One\n* Item Two\n* Item Three', 'Bullet lists'],
      ['1. First\n2. Second\n3. Third', 'Numbered lists'],
      ['Click [here](https://content.gov.uk) to visit our site.', 'Links and link text'],
    ])('Validates message body with valid markdown: %s', async (message: string) => {
      // Act
      const result = await instance.validate(message);

      // Assert
      expect(result).toEqual(message);
    });

    it.each([
      [
        `> This is a blockquote, which is not allowed.\n\nCheck out this image: ![Alt text](image.png)`,
        `Message body contains markdown elements which are not valid: blockquote_open`,
      ],
      [
        `    const x = 10;\n    const y = 20;`,
        `Message body contains markdown elements which are not valid: code_block`,
      ],
      [`\`\`\`javascript\nconst x = 10;\n\`\`\``, `Message body contains markdown elements which are not valid: fence`],
      [
        `This sentence contains \`inline code\` right here.`,
        `Message body contains markdown elements which are not valid: code_inline`,
      ],
      [
        `| Allowed | Not Allowed |\n| --- | --- |\n| Bold text | Tables |`,
        `Message body contains markdown elements which are not valid: table_open`,
      ],
      [
        `Some paragraph text\n\n---\n\nMore paragraph text`,
        `Message body contains markdown elements which are not valid: hr`,
      ],
      [
        `This is <u>underlined html</u> text.`,
        `Message body contains markdown elements which are not valid: html_inline`,
      ],
      [`This is ~~crossed out~~ text.`, `Message body contains markdown elements which are not valid: s_open`],
    ])(
      'Rejects message body with invalid markdown: %s\nWith error message: %s',
      async (messageBody: string, errorMessage: string) => {
        // Arrange
        const exception = expectedError(errorMessage);

        // Act
        const result = instance.validate(messageBody);

        // Assert
        await expect(result).rejects.toThrow(exception);
      }
    );
  });
});
