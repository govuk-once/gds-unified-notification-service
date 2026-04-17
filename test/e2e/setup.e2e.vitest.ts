import dotenv from 'dotenv';
dotenv.config();

// Surpresses unnecessary console.logs from the OTEL metrics/tracers
vi.hoisted(() => {
  process.env.POWERTOOLS_DEV = 'true';
  process.env.POWERTOOLS_METRICS_DISABLED = 'false';
});
