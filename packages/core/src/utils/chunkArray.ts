import { ServiceMisconfigurationError } from '@common/models/Errors/InternalServerError';

export const chunkArray = <T>(array: T[], chunkSize: number): T[][] => {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new ServiceMisconfigurationError(['The size of the chunks to split array is not a positive integer.']);
  }

  const chunks: T[][] = [];
  for (let startIndex = 0; startIndex < array.length; startIndex += chunkSize) {
    chunks.push(array.slice(startIndex, startIndex + chunkSize));
  }

  return chunks;
};
