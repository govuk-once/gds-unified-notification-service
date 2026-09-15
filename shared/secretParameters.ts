export type SecretParameterType = 'string' | 'json';

export interface SecretsConfig<T extends SecretParameterType = SecretParameterType> {
  Path: string;
  Type: T;
}

type ParameterTree = {
  readonly [key: string]: SecretsConfig | ParameterTree;
};

const SecretParameters = {
  Dispatch: {
    OneSignal: {
      ApiKey: {
        Path: `config/dispatch/onesignal/apiKey`,
        Type: 'string',
      },
    },
  },
} as const satisfies ParameterTree;

export default SecretParameters;
