import { certificate, GroupedConsumerCertificates, rollingCertificate } from 'infrastructure/cdk/consumers/consumers';

export const productionConsumers: () => GroupedConsumerCertificates = () => [
  // Dev certificates
  certificate({
    commonName: 'dev.2026-Q2-Q3',
    organization: 'UNS',
    organizationalUnit: 'uns',
    startDate: new Date('2026-07-13T23:59:59Z'),
    expirationDate: new Date('2026-10-13T23:59:59Z'),
    revoked: false,
  }),

  // DVLA certificates
  certificate({
    commonName: 'dvla.2026-Q2-Q3',
    organization: 'DVLA',
    organizationalUnit: 'dvla',
    startDate: new Date('2026-07-13T23:59:59Z'),
    expirationDate: new Date('2026-10-13T23:59:59Z'),
    revoked: false,
  }),
  ...rollingCertificate({
    commonName: 'dvla',
    organization: 'DVLA',
    organizationalUnit: 'dvla',
    startDate: new Date('2026-09-27T23:59:59Z'),
    frequencyInMonths: 4,
    migrationPeriodInWeeks: 4,
  }),
];
