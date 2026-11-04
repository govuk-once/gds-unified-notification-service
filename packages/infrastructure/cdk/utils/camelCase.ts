export const camelCase = (...string: string[]) =>
  string
    .map((word, wordIndex) =>
      word
        .split('')
        .map((letter, letterIndex) => (wordIndex > 0 && letterIndex == 0 ? letter.toUpperCase() : letter))
        .join('')
    )
    .join('');
