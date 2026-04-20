import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import https from 'https';
import { test as baseTest } from 'vitest';

dotenv.config();
const psoUrl = process.env.AWS_PSO_CUSTOM_DOMAIN_NAME;
const flexUrl = process.env.AWS_FLEX_CUSTOM_DOMAIN_NAME;

// Suppresses unnecessary console.logs from the OTEL metrics/tracers
vi.hoisted(() => {
  process.env.POWERTOOLS_DEV = 'true';
  process.env.POWERTOOLS_METRICS_DISABLED = 'false';
});

// Creates a https agent for mTLS using imported credentials
export const httpsAgent = new https.Agent({
  cert: fs.readFileSync('./test/e2e/config/cert-file.crt'),
  key: fs.readFileSync('./test/e2e/config/cert-file.pem'),
});

export const test = baseTest
  // Creates an axios client for PSO requests
  .extend('psoServer', ({}) => {
    const instance = axios.create({
      baseURL: `https://${psoUrl}`,
      timeout: 5000,
      httpsAgent,
    });
    return instance;
  })
  // Creates an axios client for FLEX requests
  .extend('flexServer', ({}) => {
    const instance = axios.create({
      baseURL: `https://${flexUrl}`,
      timeout: 5000,
      httpsAgent,
    });
    return instance;
  });
