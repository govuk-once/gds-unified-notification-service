export class InternalServerError extends Error {
  public statusCode = 500;
  public errors: string[] = [];

  constructor(errors: string[], message?: string) {
    super(message);
    this.name = 'InternalServerError';

    for (const error of errors) {
      this.errors.push(error);
    }
  }
}
