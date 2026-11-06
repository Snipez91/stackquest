import type { MissionInput } from "@/content/schema";
import { jsWeightStringCoercion } from "./js-weight-string-coercion";
import { jsEtaPureFunctions } from "./js-eta-pure-functions";
import { jsShipmentArrayPipeline } from "./js-shipment-array-pipeline";
import { jsNormaliseApiRecords } from "./js-normalise-api-records";
import { jsRateLimiterClosure } from "./js-rate-limiter-closure";
import { jsDispatchFormEvents } from "./js-dispatch-form-events";
import { jsEventLoopOrder } from "./js-event-loop-order";
import { jsDepotStatusAllsettled } from "./js-depot-status-allsettled";
import { jsFetchTrackingJson } from "./js-fetch-tracking-json";
import { jsDispatchErrorStates } from "./js-dispatch-error-states";
import { jsBillableWeightTests } from "./js-billable-weight-tests";
import { jsManifestStackTrace } from "./js-manifest-stack-trace";

/** JavaScript track, in map order: beginner 1–4, intermediate 1–4, advanced 1–4. */
export const javascriptMissions: MissionInput[] = [
  jsWeightStringCoercion,
  jsEtaPureFunctions,
  jsShipmentArrayPipeline,
  jsNormaliseApiRecords,
  jsRateLimiterClosure,
  jsDispatchFormEvents,
  jsEventLoopOrder,
  jsDepotStatusAllsettled,
  jsFetchTrackingJson,
  jsDispatchErrorStates,
  jsBillableWeightTests,
  jsManifestStackTrace,
];
