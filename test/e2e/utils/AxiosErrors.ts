import { AxiosError } from 'axios';

export const NotFoundAxiosError = {
  constructor: AxiosError,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  response: expect.objectContaining({
    status: 404,
    data: 'Not Found',
  }),
};

export const BadRequestAxiosError = (message?: string) => {
  return {
    constructor: AxiosError,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    response: expect.objectContaining({
      status: 400,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: message ?? expect.stringContaining(''),
      statusText: 'Bad Request',
    }),
  };
};
