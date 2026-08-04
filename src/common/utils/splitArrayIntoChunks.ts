export const splitArrayIntoChunks = <T>(array: T[], numberOfChunks: number): T[][] => {
  if (numberOfChunks <= 0) return [];

  const total = array.length;
  const baseSize = Math.floor(total / numberOfChunks);
  const remainder = total % numberOfChunks;

  const chunks: T[][] = [];
  let startIndex = 0;

  for (let i = 0; i < numberOfChunks; i++) {
    const chunkSize = baseSize + (i < remainder ? 1 : 0);
    chunks.push(array.slice(startIndex, startIndex + chunkSize));
    startIndex += chunkSize;
  }

  return chunks;
};
