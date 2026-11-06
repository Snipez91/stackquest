import type { MissionInput } from "@/content/schema";
import { mission as manifestWeights } from "./py-manifest-weights";
import { mission as delayTriage } from "./py-delay-triage";
import { mission as etaFunctions } from "./py-eta-functions";
import { mission as routeCollections } from "./py-route-collections";
import { mission as labelFormatting } from "./py-label-formatting";
import { mission as hubCsvReport } from "./py-hub-csv-report";
import { mission as logCrash } from "./py-log-crash";
import { mission as sharedUnitsModule } from "./py-shared-units-module";
import { mission as trackingIdTests } from "./py-tracking-id-tests";
import { mission as carrierApi } from "./py-carrier-api";
import { mission as tracebackRepair } from "./py-traceback-repair";
import { mission as delayReport } from "./py-delay-report";

export const pythonMissions: MissionInput[] = [
  manifestWeights,
  delayTriage,
  etaFunctions,
  routeCollections,
  labelFormatting,
  hubCsvReport,
  logCrash,
  sharedUnitsModule,
  trackingIdTests,
  carrierApi,
  tracebackRepair,
  delayReport,
];
