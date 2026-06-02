import { EnvVars } from 'infrastructure/cdk/config';
import { devConsumers } from 'infrastructure/cdk/consumers/devConsumers';
import { productionConsumers } from 'infrastructure/cdk/consumers/productionConsumers';
import { stagingConsumers } from 'infrastructure/cdk/consumers/stagingConsumers';

export const certificate = (props: {
  commonName: string;
  organization: string;
  organizationalUnit: string;
  startDate: Date;
  expirationDate: Date;
  revoked: boolean;
}) => ({
  id: [props.organization, props.organizationalUnit, props.commonName].join('-'),
  ...props,
});

export type GroupedConsumerCertificates = ReturnType<typeof certificate>[];

export const getConsumers = (env: string, config: EnvVars): GroupedConsumerCertificates => {
  switch (env) {
    case 'dev':
      return devConsumers();

    case 'stg':
      return stagingConsumers();

    case 'prod':
      return productionConsumers();
  }

  // Unmatched - sandbox certificate generation - rolling sunday to sunday
  const hour = 60 * 60 * 1000;

  console.log([
    new Date(config.utils.lastSunday().getTime() + hour),
    new Date(config.utils.nextSunday().getTime() - hour),
  ]);

  return [
    // Note: sandbox envs use short term certificates, which can be no longer than 24h
    certificate({
      commonName: 'sandbox.dev.today',
      organization: 'UNS',
      organizationalUnit: 'sandbox',
      // Sandbox certs should start at 00:01 sunday, and roll into 23:58 (CA is 00:00 to 23:59)
      startDate: new Date(config.utils.lastSunday().getTime() + hour),
      expirationDate: new Date(config.utils.nextSunday().getTime() - hour),
      revoked: false,
    }),
  ];
};
