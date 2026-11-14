import type { MetricId } from "@/lib/engine/types";

// What an astronaut can choose to share with Earth. The private journal is
// not a category: it is never shared.
export const SHARING_CATEGORIES: { id: string; label: string; metrics: MetricId[]; note: string }[] = [
  { id: "vitals", label: "Vitals", metrics: ["hr", "hrv", "bp_sys", "bp_dia", "spo2", "temp", "glucose"], note: "Heart, blood pressure, oxygen, temperature, glucose" },
  { id: "sleep", label: "Sleep & light", metrics: ["sleep_hours", "sleep_regularity", "light_exposure"], note: "Actigraphy band" },
  { id: "mood", label: "Mood", metrics: ["mood"], note: "Daily mood check-in" },
  { id: "cognition", label: "Cognition", metrics: ["pvt_rt", "pvt_lapses"], note: "Reaction-time self-test" },
  { id: "exercise_nutrition", label: "Exercise & nutrition", metrics: ["exercise_min", "activity", "hydration", "calories"], note: "Manual log and activity" },
  { id: "radiation", label: "Radiation", metrics: ["dose_daily"], note: "Personal dosimeter" },
  { id: "vision_balance", label: "Vision & balance", metrics: ["vision_score", "balance_score"], note: "Self-checks" },
  { id: "incidents", label: "Incident reports", metrics: [], note: "Triage logs sent after an emergency" },
];

export function categoryOfMetric(metric: MetricId): string {
  return SHARING_CATEGORIES.find((c) => c.metrics.includes(metric))?.id ?? "vitals";
}
