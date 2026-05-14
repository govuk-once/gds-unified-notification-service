import { DeleteItemCommandInput, DynamoDB, PutItemCommandInput } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { ICampaignRecord } from '@project/lambdas/interfaces/ICampaignRecord';
import { test } from '@test/e2e/setup.e2e.vitest';
import { AxiosError } from 'axios';
import { expect } from 'vitest';

describe('Get /status/campaign/{campaignID}?departmentID={departmentID}', () => {
  // Creates dynamoClient for testing
  const dynamoClient = new DynamoDB({
    region: 'eu-west-2',
  });

  const campaignID = 'testCampaignID';
  const departmentID = 'testDepartmentID';
  const compositeID = `${departmentID}/${campaignID}`;

  test('returns 200 and a campaign status object when called with a campaignID that exits.', async ({
    prefix,
    psoAPI,
  }) => {
    // Arrange
    const testRecord: ICampaignRecord = {
      CompositeID: compositeID,
      VALIDATING: 1,
      VALIDATED_API_CALL: 1,
    };

    const params: PutItemCommandInput = {
      TableName: `${prefix}-campaigns`,
      Item: marshall(testRecord),
    };

    await dynamoClient.putItem(params);

    onTestFinished(async () => {
      const params: DeleteItemCommandInput = {
        TableName: `${prefix}-campaigns`,
        Key: marshall({
          ['CompositeID']: compositeID,
        }),
      };

      await dynamoClient.deleteItem(params);
    });

    // Act
    const result = await psoAPI.get(`/status/campaign/${campaignID}?departmentID=${departmentID}`);

    // Assert
    expect(result.status).toBe(200);
    expect(result.data).toEqual({
      CampaignID: campaignID,
      DepartmentID: departmentID,
      ProcessingSummary: {
        VALIDATING: 1,
        VALIDATED: 0,
        VALIDATED_API_CALL: 1,
        PROCESSING: 0,
        PROCESSED: 0,
        PROCESSING_FAILED: 0,
        DISPATCHING: 0,
        DISPATCHED: 0,
        DISPATCHING_FAILED: 0,
      },
      UsageSummary: {
        RECEIVED: 0,
        READ: 0,
        MARKED_AS_UNREAD: 0,
        HIDDEN: 0,
      },
    });
  });

  test('returns 404 when given compositeID does not exist.', async ({ psoAPI }) => {
    // Arrange
    const invalidCampaignID = 'invalidCampaignID';

    // Act
    try {
      await psoAPI.get(`/status/campaign/${invalidCampaignID}?departmentID=${departmentID}`);
      throw new Error('Request should have failed with 404 but succeeded instead.');
    } catch (error) {
      // Assert
      expect(error).instanceOf(AxiosError);
      const axiosError = error as AxiosError;
      expect(axiosError.response?.status).toBe(404);
      expect(axiosError.response?.data).toBe('Not Found');
    }
  });
});
