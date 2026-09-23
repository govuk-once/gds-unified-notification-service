export const filters = {
  isNotUndefined: <T>(x: T | undefined): x is T => x !== undefined,
  isNotNull: <T>(x: T | null): x is T => x !== null,
  isDefined: <T>(x: T | null | undefined): x is T => filters.isNotUndefined(x) && filters.isNotNull(x),
};

export const maps = {
  pick:
    <T extends object, U extends keyof T>(prop: U) =>
    (obj: T) =>
      obj[prop],
};
