import { MessageFormatEnum } from '@common/models/MessageFormatEnum';
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
    return httpError.BadRequest(`Bad request: \n\n ${content}`);
  };

  beforeEach(() => {
    // Reset all mock
    vi.clearAllMocks();

    // Mock SSM Values
    mockParameterStore = mockDefaultConfig();
    configurationServiceMock.getParameter.mockImplementation(mockGetParameterImplementation(mockParameterStore));

    instance = new ContentValidationService(observabilityMock, configurationServiceMock);
  });

  describe(`validate`, () => {
    describe(`Valid scenarios`, () => {
      it.each([
        [`Message mentioning https://content.gov.uk val`],
        [`Deeplink to any other part of app govuk://home`],
        ['Message without a deeplink'],
        [undefined],
      ])("Content '%s' should be allowed", async (content: string | undefined) => {
        // Arrange & Act
        const result = await instance.validate(content);

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
        await expect(instance.validate(content)).rejects.toThrow(exception);
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
          const result = instance.validate(content);

          // Act & Assert
          await expect(result).rejects.toThrow(exception);
        });
      });
    });
  });

  describe('validateWithMessageFormat', () => {
    it('Valid message body for markdown.', async () => {
      // Arrange
      const message = 'some text some text [Click here](https://dvla.gov.uk) some text some text';

      // Act
      const result = await instance.validateWithMessageFormat(message, MessageFormatEnum.MARKDOWN);

      // Assert
      expect(result).toEqual(message);
    });

    it.each([
      `    
      > This is a blockquote, which is not allowed.

      Check out this image: ![Alt text](image.png)
      `,
      `
      javascript
      const x = 10;
      `,
      `
      | Allowed | Not Allowed |
      | --- | --- |
      | Bold text | Tables |
      `,
      `
      This is a long title
      ====================
      `,
      `
      Subheading One
      --------------
      `,
    ])('Invalid message body for markdown', async (messageBody: string) => {
      // Act
      const result = instance.validateWithMessageFormat(messageBody, MessageFormatEnum.MARKDOWN);

      // Assert
      await expect(result).rejects.toThrow(httpError.BadRequest);
    });

    it('Valid message body for plain text.', async () => {
      // Arrange
      const message = 'some text some text https://dvla.gov.uk/ some text some text';

      // Act
      const result = await instance.validateWithMessageFormat(message, MessageFormatEnum.MARKDOWN);

      // Assert
      expect(result).toEqual(message);
    });

    it.each([
      `    
      > This is a blockquote, which is not allowed.

      Check out this image: ![Alt text](image.png)
      `,
      `
      javascript
      const x = 10;
      `,
      `
      | Allowed | Not Allowed |
      | --- | --- |
      | Bold text | Tables |
      `,
      `
      This is a long title
      ====================
      `,
      `
      Subheading One
      --------------
      `,
      // This would pass the markdown validation
      'some text some text [Click here](https://dvla.gov.uk) some text some text',
    ])('Invalid message body for plain text.', async (message: string) => {
      // Act
      const result = instance.validateWithMessageFormat(message, MessageFormatEnum.PLAINTEXT);

      // Assert
      await expect(result).rejects.toThrow(httpError.BadRequest);
    });
  });
});
