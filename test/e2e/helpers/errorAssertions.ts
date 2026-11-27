import type CustomWorld from '@test/e2e/support/world';
import { expect } from 'vitest';
import z from 'zod';

const errorResponseSchema = z.object({
  Status: z.number(),
  HttpError: z.string(),
  Errors: z.array(z.string()),
});

// Add each validation variant here, then pass the same key to pushErrorAssertions; every listed substring must appear in Errors.
export const validationErrorVariants: Record<string, string[]> = {
  'with no UserID': ['UserID'],
  'with no NotificationTitle': ['NotificationTitle'],
  'with no NotificationBody': ['NotificationBody'],
  'with no request body': ['expected array'],
  'with an invalid URL in markdown': ['not on the allow list'],
  'with invalid markdown': ['not valid'],
  'with a negative ExpiresInDays': ['>0'],
  'with a float ExpiresInDays': ['expected int'],
  'with an ExpiresInDays below the organisation minimum': ['less than the minimum'],
  'with an ExpiresInDays above the organisation maximum': ['greater than the maximum'],
  'with duplicate NotificationIDs': ['Duplicate NotificationIDs'],
  'with a DeeplinkURL with a disallowed hostname': ['not on the allow list'],
  'with a DeeplinkURL with a disallowed protocol': ['not allowed'],
  'with no Namespace': ['Namespace'],
  'with no Group': ['Group'],
  'with the same GroupNotificationID': ['Duplicate GroupNotificationIDs'],
  INVALID_STATUS: ['Status', '"READ"', '"MARKED_AS_UNREAD"', '"RECEIVED"'],
};

export const pushErrorAssertions = (world: CustomWorld, variant: string) => {
  const keywords = validationErrorVariants[variant];
  if (!keywords) return;
  world.errorAssertions.push((body) => {
    const parsed = errorResponseSchema.parse(JSON.parse(body as string));
    for (const keyword of keywords) {
      expect(parsed.Errors).toEqual(expect.arrayContaining([expect.stringContaining(keyword)]));
    }
  });
};
