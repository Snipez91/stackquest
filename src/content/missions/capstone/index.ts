import type { MissionInput } from "@/content/schema";
import { mission as capNightlyExportJob } from "./cap-nightly-export-job";
import { mission as capDispatchOutage } from "./cap-dispatch-outage";
import { mission as capDashboardWrongPort } from "./cap-dashboard-wrong-port";
import { mission as capPostIncidentReview } from "./cap-post-incident-review";

export const capstoneMissions: MissionInput[] = [
  capNightlyExportJob,
  capDispatchOutage,
  capDashboardWrongPort,
  capPostIncidentReview,
];
