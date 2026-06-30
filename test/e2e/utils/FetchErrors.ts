export const HttpErrorExpectFactory = (code: number, label: string) => (errors?: string[]) => {
  return {
    status: code,
    body: JSON.stringify({
      Status: code,
      HttpError: label,
      Errors: errors ?? [],
    }),
  };
};

export const NotFoundAxiosError = HttpErrorExpectFactory(404, 'NotFound');
export const BadRequestAxiosError = HttpErrorExpectFactory(400, 'BadRequest');
