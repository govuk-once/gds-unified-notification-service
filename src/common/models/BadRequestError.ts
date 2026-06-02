export class BadRequestError extends Error {
  public statusCode = 400;
  public errors: string[] = [];

  constructor(errors: string[], message?: string) {
    super(message);
    this.name = 'BadRequestError';

    for (const error of errors) {
      this.errors.push(error);
    }
  }
}
