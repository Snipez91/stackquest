import type { MissionInput } from "@/content/schema";
import { lxFindMisplacedManifest } from "./lx-find-misplaced-manifest";
import { lxStageReleaseDir } from "./lx-stage-release-dir";
import { lxTopErrorSources } from "./lx-top-error-sources";
import { lxHandoffPermissions } from "./lx-handoff-permissions";

/** Linux track, in map order: beginner 1–4, intermediate 1–4, advanced 1–4. */
export const linuxMissions: MissionInput[] = [lxFindMisplacedManifest, lxStageReleaseDir, lxTopErrorSources, lxHandoffPermissions];
