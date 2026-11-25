import { certificate, GroupedConsumerCertificates, rollingCertificate } from '@infra/cdk/consumers/consumers';

export const devConsumers: () => GroupedConsumerCertificates = () => [
  // Dev certificates
  ...rollingCertificate({
    commonName: 'dev',
    organization: 'UNS',
    organizationalUnit: 'developers',
    startDate: new Date('2026-09-13T23:59:59Z'),
    frequencyInMonths: 3,
    migrationPeriodInWeeks: 4,
  }),

  // QA certificates
  certificate({
    commonName: 'uns-qa.2026-Q4',
    organization: 'QA',
    organizationalUnit: 'qa',
    startDate: new Date('2026-11-03T23:59:59Z'),
    expirationDate: new Date('2026-12-13T23:59:59Z'),
    revoked: false,
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
  ...rollingCertificate({
    commonName: 'ea',
    organization: 'EventsAggregator',
    organizationalUnit: 'ea',
    startDate: new Date('2026-09-13T23:59:59Z'),
    frequencyInMonths: 3,
    migrationPeriodInWeeks: 4,
  }),
];
