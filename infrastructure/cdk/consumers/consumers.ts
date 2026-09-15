import { EnvVars } from 'infrastructure/cdk/config';
import { devConsumers } from 'infrastructure/cdk/consumers/devConsumers';
import { productionConsumers } from 'infrastructure/cdk/consumers/productionConsumers';
import { stagingConsumers } from 'infrastructure/cdk/consumers/stagingConsumers';

/**
 * Explicitly creates a certificate based on properties
 */
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

/**
 * Automatically creates a certificate based on the period
 * Appends YYYY-MM-DD.YYYY-MM-DD based on start and end
 */
export const rollingCertificate = (props: {
  commonName: string;
  organization: string;
  organizationalUnit: string;
  startDate: Date;
  frequencyInMonths?: number;
  migrationPeriodInWeeks?: number;
}) => {
  const frequencyMonths = props.frequencyInMonths ?? 3;
  const migrationWeeks = props.migrationPeriodInWeeks ?? 1;

  const addMonths = (date: Date, months: number) => {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  };

  const addWeeks = (date: Date, weeks: number) => {
    const result = new Date(date);
    result.setDate(result.getDate() + weeks * 7);
    return result;
  };

  const toDate = (date: Date) => date.toISOString().split('T').shift()!;

  const now = new Date();
  const certificates: ReturnType<typeof certificate>[] = [];
  let periodStart = new Date(props.startDate);

  while (periodStart <= now) {
    const periodEnd = addMonths(periodStart, frequencyMonths);

    if (now < periodEnd) {
      certificates.push(
        certificate({
          commonName: `${props.commonName}.${toDate(periodStart)}.${toDate(periodEnd)}`,
          organization: props.organization,
          organizationalUnit: props.organizationalUnit,
          startDate: periodStart,
          expirationDate: periodEnd,
          revoked: false,
        })
      );
    }

    periodStart = addWeeks(periodEnd, -migrationWeeks);
  }

  return certificates;
};

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
