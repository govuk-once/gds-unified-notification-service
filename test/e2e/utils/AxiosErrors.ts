import { AxiosError } from 'axios';

export const NotFoundAxiosError = (errors?: string[]) => {
  return {
    constructor: AxiosError,
    response: {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        Status: 404,
        HttpError: 'NotFound',
        Errors: errors ?? [],
      }),
    },
  };
};

export const BadRequestAxiosError = (errors?: string[]) => {
  return {
    constructor: AxiosError,
    response: {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        Status: 400,
        HttpError: 'BadRequest',
        Errors: errors ?? [],
      }),
    },
  };
};
