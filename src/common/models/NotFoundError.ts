export class NotFoundError extends Error {
  public statusCode = 404;
  public errors: string[] = [];

  constructor(errors: string[], message?: string) {
    super(message);
    this.name = 'NotFoundError';

    for (const error of errors) {
      this.errors.push(error);
    }
  }
}
