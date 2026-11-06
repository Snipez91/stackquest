import type { MissionInput } from "@/content/schema";
import { lxFindMisplacedManifest } from "./lx-find-misplaced-manifest";
import { lxStageReleaseDir } from "./lx-stage-release-dir";
import { lxTopErrorSources } from "./lx-top-error-sources";
import { lxHandoffPermissions } from "./lx-handoff-permissions";
import { lxDeployGroupAccess } from "./lx-deploy-group-access";
import { lxNotifyServiceConfig } from "./lx-notify-service-config";
import { lxStalePortHolder } from "./lx-stale-port-holder";
import { lxEtaSyncEnv } from "./lx-eta-sync-env";
import { lxIncidentTimeline } from "./lx-incident-timeline";
import { lxConfigPermissionDenied } from "./lx-config-permission-denied";
import { lxFeedCheckScript } from "./lx-feed-check-script";
import { lxDispatchOutage } from "./lx-dispatch-outage";

/** Linux track, in map order: beginner 1–4, intermediate 1–4, advanced 1–4. */
export const linuxMissions: MissionInput[] = [
  lxFindMisplacedManifest,
  lxStageReleaseDir,
  lxTopErrorSources,
  lxHandoffPermissions,
  lxDeployGroupAccess,
  lxNotifyServiceConfig,
  lxStalePortHolder,
  lxEtaSyncEnv,
  lxIncidentTimeline,
  lxConfigPermissionDenied,
  lxFeedCheckScript,
  lxDispatchOutage,
];
