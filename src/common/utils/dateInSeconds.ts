import { ParsingFailedError } from '@common/models';

export default class DateInSeconds {
  public static now() {
    return Math.floor(Date.now() / 1000);
  }

  public static toSeconds(input: Date | string): number {
    if (typeof input === 'string') {
      const inputDate = new Date(input);

      if (isNaN(inputDate.getTime())) {
        throw new ParsingFailedError(['Invalid datetime string', input]);
      }

      return Math.floor(inputDate.getTime() / 1000);
    }

    return Math.floor(input.getTime() / 1000);
  }
}
