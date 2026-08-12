import { createHash } from 'node:crypto';

export function md5ToUuidV4<T extends object>(input: T): string {
  const concentratedObject = JSON.stringify(Object.values(input));

  const buffer = createHash('md5').update(concentratedObject).digest();
  buffer[6] = (buffer[6] & 0x0f) | 0x40;
  buffer[8] = (buffer[8] & 0x3f) | 0x80;
  const hex = buffer.toString('hex');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
