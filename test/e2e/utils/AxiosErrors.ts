import { AxiosError } from 'axios';

export const NotFoundAxiosError = {
  constructor: AxiosError,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  response: expect.objectContaining({
    status: 404,
    data: 'Not Found',
  }),
};

export const BadRequestAxiosError = (errors?: string[]) => {
  return {
    constructor: AxiosError,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    response: expect.objectContaining({
      Status: 400,
      HttpError: 'Bad Request',

      Errors: errors ?? [],
    }),
  };
};
