import { v4 as uuid } from 'uuid';

const MAX_CODE_LENGTH = 5;

export const e2eUUID = (code: string) => {
  if (code.length > MAX_CODE_LENGTH) throw new Error(`e2eUUID code must be ${MAX_CODE_LENGTH} chars or fewer`);
  return `e2e${code.padEnd(MAX_CODE_LENGTH, '0')}-${uuid().slice(9)}`;
};
