import {
  APIHandler,
  HandlerDependencies,
  iocGetCampaignsDynamoRepository,
  iocGetObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { BadRequestError } from '@common/models/Errors/BadRequestError';
import { NotFoundError } from '@common/models/Errors/NotFoundError';
import { CampaignsDynamoRepository } from '@common/repositories';
import { ObservabilityService } from '@common/services';
import type { Context } from 'aws-lambda';
import z from 'zod';

const requestBodySchema = z.any();
const responseBodySchema = z.object({
  CampaignID: z.string(),
  DepartmentID: z.string(),
  ProcessingSummary: z.object({
    RECEIVED: z.number(),
    PROCESSED: z.number(),
    DISPATCHED: z.number(),
  }),
  UsageSummary: z.object({
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

    const organisationID = event.requestContext.authorizer?.Organization as string;
    if (!organisationID) {
      throw new BadRequestError(['Missing DepartmentID']);
    }

    const departmentID = event.queryStringParameters?.departmentID;

    const compositeID = CampaignsDynamoRepository.buildCompositeID(organisationID, departmentID, campaignID);
    const campaign = await this.campaignsDynamoRepository.getRecord(compositeID);
    // If it doesn't exist - 404
    if (campaign == null) {
      throw new NotFoundError();
    }

    const compositeSegments = campaign.CompositeID.split('/');
    const campaignId = compositeSegments[compositeSegments.length - 1];

    return {
      body: {
        CampaignID: campaignId,
        DepartmentID: compositeSegments.length >= 3 ? compositeSegments[1] : compositeSegments[0],
        ProcessingSummary: {
          RECEIVED: (campaign.VALIDATED ?? 0) + (campaign.VALIDATED_API_CALL ?? 0),
          PROCESSED: campaign.PROCESSED ?? 0,
          DISPATCHED: campaign.DISPATCHED ?? 0,
        },
        UsageSummary: {
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
