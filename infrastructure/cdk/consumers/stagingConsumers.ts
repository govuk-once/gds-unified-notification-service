import { certificate, GroupedConsumerCertificates } from 'infrastructure/cdk/consumers/consumers';

export const stagingConsumers: () => GroupedConsumerCertificates = () => [
  // Dev certificates
  certificate({
    commonName: 'dev.2026-Q2-Q3',
    organization: 'UNS',
    organizationalUnit: 'uns',
    startDate: new Date('2026-05-27T23:59:59Z'),
    expirationDate: new Date('2026-09-31T23:59:59Z'),
    revoked: false,
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
];
