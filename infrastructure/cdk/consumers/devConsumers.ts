import { certificate, GroupedConsumerCertificates, rollingCertificate } from 'infrastructure/cdk/consumers/consumers';

export const devConsumers: () => GroupedConsumerCertificates = () => [
  // Dev certificates
  certificate({
    commonName: 'dev.2026-Q2-Q3',
    organization: 'UNS',
    organizationalUnit: 'developers',
    startDate: new Date('2026-05-27T23:59:59Z'),
    expirationDate: new Date('2026-09-31T23:59:59Z'),
    revoked: false,
  }),
  ...rollingCertificate({
    commonName: 'dev',
    organization: 'UNS',
    organizationalUnit: 'developers',
    startDate: new Date('2026-09-13T23:59:59Z'),
    frequencyInMonths: 3,
    migrationPeriodInWeeks: 4,
  }),

  // DVLA certificates
  certificate({
    commonName: 'dvla.2026-Q2-Q3',
    organization: 'DVLA',
    organizationalUnit: 'dvla',
    startDate: new Date('2026-05-27T23:59:59Z'),
    expirationDate: new Date('2026-09-31T23:59:59Z'),
    revoked: false,
  }),
  ...rollingCertificate({
    commonName: 'dvla',
    organization: 'DVLA',
    organizationalUnit: 'dvla',
    startDate: new Date('2026-09-13T23:59:59Z'),
    frequencyInMonths: 3,
    migrationPeriodInWeeks: 4,
  }),

  // Events Aggregator
  certificate({
    commonName: 'ea.2026-Q2-Q3',
    organization: 'EventsAggregator',
    organizationalUnit: 'ea',
    startDate: new Date('2026-05-27T23:59:59Z'),
    expirationDate: new Date('2026-09-31T23:59:59Z'),
    revoked: false,
  }),
  ...rollingCertificate({
    commonName: 'ea',
    organization: 'EventsAggregator',
    organizationalUnit: 'ea',
    startDate: new Date('2026-09-13T23:59:59Z'),
    frequencyInMonths: 3,
    migrationPeriodInWeeks: 4,
  }),
];
