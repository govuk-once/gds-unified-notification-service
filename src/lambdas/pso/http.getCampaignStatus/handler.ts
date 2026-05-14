import {
  APIHandler,
  HandlerDependencies,
  iocGetCampaignsDynamoRepository,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { CampaignsDynamoRepository } from '@common/repositories';
import { ObservabilityService } from '@common/services';
import type { Context } from 'aws-lambda';
import httpErrors from 'http-errors';
import z from 'zod';

const requestBodySchema = z.any();
const responseBodySchema = z.object({
  CampaignID: z.string(),
  DepartmentID: z.string(),
  ProcessingSummary: z.object({
    VALIDATING: z.number(),
    VALIDATED: z.number(),
    VALIDATED_API_CALL: z.number(),
    PROCESSING: z.number(),
    PROCESSED: z.number(),
    PROCESSING_FAILED: z.number(),
    DISPATCHING: z.number(),
    DISPATCHED: z.number(),
    DISPATCHING_FAILED: z.number(),
  }),
  UsageSummary: z.object({
    RECEIVED: z.number(),
    READ: z.number(),
    MARKED_AS_UNREAD: z.number(),
    HIDDEN: z.number(),
  }),
});

export class GetCampaignStatus extends APIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'getCampaignStatus';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  public campaignsDynamoRepository: CampaignsDynamoRepository;

  constructor(
    protected observability: ObservabilityService,
    asyncDependencies?: () => HandlerDependencies<GetCampaignStatus>
  ) {
    super(observability);
    this.injectDependencies(asyncDependencies);
  }

  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    const campaignID = event.pathParameters?.campaignID;
    const departmentID = event.queryStringParameters?.departmentID ?? '';

    // Handle missing path param
    if (!campaignID) {
      this.observability.logger.info('campaignID has not been provided.');
      throw new httpErrors.BadRequest();
    }

    const compositeID = `${departmentID}/${campaignID}`;
    const campaign = await this.campaignsDynamoRepository.getRecord(compositeID);

    // If it doesn't exist - 404
    if (campaign == null) {
      throw new httpErrors.NotFound();
    }

    return {
      body: {
        CampaignID: campaign.CompositeID.split('/')[1],
        DepartmentID: campaign.CompositeID.split('/')[0],
        ProcessingSummary: {
          VALIDATING: campaign.VALIDATING ?? 0,
          VALIDATED: campaign.VALIDATED ?? 0,
          VALIDATED_API_CALL: campaign.VALIDATED_API_CALL ?? 0,
          PROCESSING: campaign.PROCESSING ?? 0,
          PROCESSED: campaign.PROCESSED ?? 0,
          PROCESSING_FAILED: campaign.PROCESSING_FAILED ?? 0,
          DISPATCHING: campaign.DISPATCHING ?? 0,
          DISPATCHED: campaign.DISPATCHED ?? 0,
          DISPATCHING_FAILED: campaign.DISPATCHING_FAILED ?? 0,
        },
        UsageSummary: {
          RECEIVED: campaign.RECEIVED ?? 0,
          READ: campaign.READ ?? 0,
          MARKED_AS_UNREAD: campaign.MARKED_AS_UNREAD ?? 0,
          HIDDEN: campaign.HIDDEN ?? 0,
        },
      },
      statusCode: 200,
    };
  }
}

export const handler = new GetCampaignStatus(iocGetObservabilityService(), () => ({
  campaignsDynamoRepository: iocGetCampaignsDynamoRepository(),
})).handler();
