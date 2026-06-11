export abstract class BaseError extends Error {
  public statusCode: number;

  constructor(
    public errors: string[],
    message?: string
  ) {
    super(message);
  }
}
