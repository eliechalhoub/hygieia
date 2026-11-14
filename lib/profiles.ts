import raw from "@/content/profiles.json";
import type { EngineConfig, HardLimit, MetricId, RegionWeights } from "@/lib/engine/types";

export type ProfileId = "transit" | "station" | "lunar" | "mars" | "clinic";

export interface CabinThresholds {
  co2_mmHg: { amber: number; red: number };
  pressure_kPa: { low: number; high: number; nominal: number };
  temp_C: { low: number; high: number };
  noise_dBA: { amber: number; red: number };
  light_lux_day: { low: number };
}

export interface Profile {
  id: ProfileId;
  label: string;
  subtitle: string;
  gravity_label: string;
  gravity_g: number;
  comms: { real_one_way_s: number; demo_one_way_s: number; label: string; note: string; source_id: string };
  dose: { source_id: string; mSv_per_day: number; neutron_share: number; neutron_share_demo: boolean };
  kit: string[];
  exercise: { prescription_min: number; devices: string[]; note: string; source_id: string };
  thresholds: {
    zAmber: number;
    zRed: number;
    hard: Partial<Record<MetricId, HardLimit>>;
    cabin: CabinThresholds;
  };
  region_weights: RegionWeights;
  weights_note: string;
  task_thresholds: Record<string, number>;
  cpr_method: "evetts_russomano" | "surface_kneeling" | "standard";
  /** True for the Earth-mode profile. */
  earth?: boolean;
  checks: { id: string; label: string; when: string }[];
  triage_extras: string[];
}

export interface MissionPhase {
  id: string;
  label: string;
  days: number;
  profile: ProfileId;
}

const data = raw as unknown as {
  order: ProfileId[];
  profiles: Record<ProfileId, Profile>;
  kit_labels: Record<string, string>;
  mission_plan: { demo: boolean; note: string; phases: MissionPhase[] };
};

export const PROFILE_ORDER: ProfileId[] = data.order;
export const PROFILES: Record<ProfileId, Profile> = data.profiles;
export const KIT_LABELS: Record<string, string> = data.kit_labels;
export const MISSION_PLAN = data.mission_plan;

export function getProfile(id: string | null | undefined): Profile {
  return PROFILES[(id as ProfileId) ?? "transit"] ?? PROFILES.transit;
}

export function engineConfigFor(profile: Profile): EngineConfig {
  return {
    thresholds: { zAmber: profile.thresholds.zAmber, zRed: profile.thresholds.zRed, hard: profile.thresholds.hard },
    regionWeights: profile.region_weights,
    exercisePrescriptionMin: profile.exercise.prescription_min,
  };
}

/** Planned mission dose by phase, from the sourced daily rates. */
export function plannedDose(): { phases: (MissionPhase & { mSv: number; rate: number; source_id: string })[]; total: number; transitShare: number } {
  const phases = MISSION_PLAN.phases.map((p) => {
    const prof = PROFILES[p.profile];
    return { ...p, rate: prof.dose.mSv_per_day, mSv: prof.dose.mSv_per_day * p.days, source_id: prof.dose.source_id };
  });
  const total = phases.reduce((a, p) => a + p.mSv, 0);
  const transit = phases.filter((p) => p.profile === "transit").reduce((a, p) => a + p.mSv, 0);
  return { phases, total, transitShare: transit / total };
}
