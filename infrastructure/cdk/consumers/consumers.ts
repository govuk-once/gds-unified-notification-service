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

export const getConsumers = (env: string): GroupedConsumerCertificates => {
  switch (env) {
    case 'dev':
      return devConsumers();

    case 'stg':
      return stagingConsumers();

    case 'prod':
      return productionConsumers();
  }

  // Unmatched - sandbox certificate generation

  const yesterdayMidnight = new Date();
  yesterdayMidnight.setDate(yesterdayMidnight.getDate() - 1);
  yesterdayMidnight.setUTCHours(0, 0, 0, 0);

  const tomorrowMidnight = new Date();
  tomorrowMidnight.setDate(tomorrowMidnight.getDate() + 1);
  tomorrowMidnight.setUTCHours(23, 59, 59, 0);

  return [
    // Note: sandbox envs use short term certificates, which can be no longer than 24h
    certificate({
      commonName: 'sandbox.dev.today',
      organization: 'UNS',
      organizationalUnit: 'sandbox',
      // Round to 00:00:00 yesterday
      startDate: yesterdayMidnight,
      // Round to 00:00:00 tomorrow
      expirationDate: tomorrowMidnight,
      revoked: false,
    }),
  ];
};
