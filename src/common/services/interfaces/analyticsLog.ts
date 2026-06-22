import { NotificationStateEnum } from "@common/models/NotificationStateEnum";
import { IAnalytics } from "@project/lambdas/interfaces/IAnalyticsSchema";

export interface IAnalyticsLog {
  EventID: string,
  EventTimestamp: string,
  OrganisationID: string,
  DepartmentID?: string,   
  NotificationID: string,
  CampaignID?: string,
  EventStatus: NotificationStateEnum,
}

export const IAnalyticsToIAnalyticsLog = (item: IAnalytics): IAnalyticsLog => {
  return {
    EventID: item.EventID,
    EventTimestamp: item.EventDateTime,
    OrganisationID: item.OrganisationID,
    DepartmentID: item.DepartmentID,
    NotificationID: item.NotificationID,
    CampaignID: item.CampaignID,
    EventStatus: item.Event,
  }
};
