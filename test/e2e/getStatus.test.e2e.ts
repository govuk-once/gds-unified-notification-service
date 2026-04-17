import axios from 'axios';
import { httpsAgent } from '@test/e2e/httpsAgent';
import { expect, it } from 'vitest';

describe('GET /status', () => {
  it('returns 200 when calling the status endpoint', async () => {
    // Arrange
    const url = process.env.AWS_PSO_CUSTOM_DOMAIN_NAME;

    // Act
    const result = await axios.get(`https://${url}/status`, { httpsAgent });

    // Assert
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ status: 'ok' });
  });
});
