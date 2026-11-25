import { certificate, GroupedConsumerCertificates, rollingCertificate } from '@infra/cdk/consumers/consumers';

export const stagingConsumers: () => GroupedConsumerCertificates = () => [
  // Dev certificates
  ...rollingCertificate({
    commonName: 'dev',
    organization: 'UNS',
    organizationalUnit: 'uns',
    startDate: new Date('2026-09-13T23:59:59Z'),
    frequencyInMonths: 3,
    migrationPeriodInWeeks: 4,
  }),

  // DVLA certificates
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
    commonName: 'ea.2026-Q2-Q4',
    organization: 'EventsAggregator',
    organizationalUnit: 'ea',
    startDate: new Date('2026-08-24T23:59:59Z'),
    expirationDate: new Date('2026-12-31T23:59:59Z'),
    revoked: false,
  }),
  ...rollingCertificate({
    commonName: 'ea',
    organization: 'EventsAggregator',
    organizationalUnit: 'ea',
    startDate: new Date('2026-12-31T23:59:59Z'),
    frequencyInMonths: 3,
    migrationPeriodInWeeks: 4,
  }),
];
