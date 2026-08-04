import { ServiceMisconfigurationError } from '@common/models/Errors/InternalServerError';

export const splitIntoChunks = <T>(arr: T[], numChunks: number): T[][] => {
  if (numChunks < 1 || numChunks % 1 !== 0) {
    throw new ServiceMisconfigurationError(['Number of chunks to divide array must be a whole number greater than 0.']);
  }

  const total = arr.length;
  const baseSize = Math.floor(total / numChunks);
  const remainder = total % numChunks;

  const result: T[][] = [];
  let offset = 0;

  for (let i = 0; i < numChunks; i++) {
    const chunkSize = baseSize + (i < remainder ? 1 : 0);
    if (chunkSize === 0) break;
    result.push(arr.slice(offset, offset + chunkSize));
    offset += chunkSize;
  }

  return result;
};
