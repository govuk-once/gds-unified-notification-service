import {
  APIHandler,
  ConfigurationService,
  HandlerDependencies,
  iocGetConfigurationService,
  iocGetObservabilityService,
  ObservabilityService,
  type ITypedRequestEvent,
  type ITypedRequestResponse,
} from '@common';
import { BadRequestError } from '@common/models/Errors/BadRequestError';
import { IGroupMessageSchema } from '@project/lambdas/interfaces';
import type { Context } from 'aws-lambda';
import { v4 } from 'uuid';
import z from 'zod';

const requestBodySchema = z.array(IGroupMessageSchema.omit({ OrganisationID: true }).strict()).min(1);
const responseBodySchema = z.array(z.object({ GroupNotificationID: z.string() })).or(z.object());

/**
* Sample post body:
    {
      "DepartmentID": "DEP01",
      "CampaignID:" "CAM_ID"
      "MessageTitle": "You have a new Message",
      "MessageBody": "Open Notification Centre to read your notifications",
      "NotificationTitle": "You have a new Notification",
      "NotificationBody": "Here is the Notification body."
    }
 */

export class PostGroupMessage extends APIHandler<typeof requestBodySchema, typeof responseBodySchema> {
  public operationId: string = 'postGroupMessage';
  public requestBodySchema = requestBodySchema;
  public responseBodySchema = responseBodySchema;

  constructor(
    protected config: ConfigurationService,
    protected observability: ObservabilityService,
    dependencies?: () => HandlerDependencies<PostGroupMessage>
  ) {
    super(observability);
    this.injectDependencies(dependencies);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async implementation(
    event: ITypedRequestEvent<z.infer<typeof requestBodySchema>>,
    context: Context
  ): Promise<ITypedRequestResponse<z.infer<typeof responseBodySchema>>> {
    this.observability.logger.info('Received request', { event });

    const organisationID = event.requestContext.authorizer?.Organization as string | undefined;

    if (!organisationID) {
      throw new BadRequestError(['Organisation could be not be resolved from the client certificate.']);
    }

    // Return placeholder status
    return {
      body: event.body.map((x) => {
        return {
          GroupNotificationID: v4(),
        };
      }),
      statusCode: 202,
    };
  }
}

export const handler = new PostGroupMessage(
  iocGetConfigurationService(),
  iocGetObservabilityService(),
  () => ({})
).handler();
