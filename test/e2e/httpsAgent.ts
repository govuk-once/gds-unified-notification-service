import https from 'https';
import fs from 'fs';

export const httpsAgent = new https.Agent({
  cert: fs.readFileSync('./test/e2e/config/cert-file.crt'),
  key: fs.readFileSync('./test/e2e/config/cert-file.pem'),
});
