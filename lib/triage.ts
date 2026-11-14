import chestPain from "@/content/triage/chest_pain.json";
import postEva from "@/content/triage/post_eva.json";
import type { Profile } from "@/lib/profiles";

// Emergency triage trees. They are plain JSON bundled with the app, so this
// path needs no network and no language model.

export interface TriageOption {
  label: string;
  voice?: string;
  next: string;
  action?: string;
}

export interface TriageNode {
  type?: "cpr" | "end";
  prompt: string;
  help?: string;
  options: TriageOption[];
  capture_vitals?: string[];
  /** Kit item this step needs; if the profile lacks it the step is skipped to `else`. */
  requires_kit?: string;
  /** Profile-specific extra step id (profile.triage_extras). */
  requires_extra?: string;
  else?: string;
  cause?: string;
  kit_actions?: string[];
}

export interface TriageTree {
  id: string;
  title: string;
  voice_aliases: string[];
  disclaimer: string;
  start: string;
  nodes: Record<string, TriageNode>;
}

export const TREES: Record<string, TriageTree> = {
  chest_pain: chestPain as unknown as TriageTree,
  post_eva: postEva as unknown as TriageTree,
};

export const TREE_ORDER = ["chest_pain", "post_eva"];

type KitProfile = Pick<Profile, "kit" | "triage_extras">;

function available(node: TriageNode, profile: KitProfile): boolean {
  if (node.requires_kit && !profile.kit.includes(node.requires_kit)) return false;
  if (node.requires_extra && !profile.triage_extras.includes(node.requires_extra)) return false;
  return true;
}

/**
 * Resolve a node id for a profile: steps whose kit or extra is not available
 * in this environment are skipped to their `else` target.
 */
export function resolveNode(tree: TriageTree, nodeId: string, profile: KitProfile): { id: string; node: TriageNode; skipped: string[] } {
  const skipped: string[] = [];
  let id = nodeId;
  for (let guard = 0; guard < 20; guard++) {
    const node = tree.nodes[id];
    if (!node) throw new Error(`Unknown triage node "${id}" in tree "${tree.id}"`);
    if (available(node, profile) || !node.else) return { id, node, skipped };
    skipped.push(id);
    id = node.else;
  }
  throw new Error(`Triage tree "${tree.id}" has a skip loop at "${nodeId}"`);
}

/** Every step a crew member could reach in this profile. */
export function visibleNodes(treeId: string, profile: KitProfile): string[] {
  const tree = TREES[treeId];
  const seen = new Set<string>();
  const queue = [tree.start];
  while (queue.length) {
    const { id, node } = resolveNode(tree, queue.pop()!, profile);
    if (seen.has(id)) continue;
    seen.add(id);
    for (const o of node.options) queue.push(o.next);
  }
  return [...seen];
}

/** Kit actions listed on a step, split by whether this profile carries the item. */
export function kitFor(node: TriageNode, profile: KitProfile): { have: string[]; missing: string[] } {
  const items = node.kit_actions ?? [];
  return { have: items.filter((k) => profile.kit.includes(k)), missing: items.filter((k) => !profile.kit.includes(k)) };
}

export interface TriageLogEntry {
  ts: string;
  node: string;
  prompt: string;
  answer: string;
  detail?: string;
}

export interface IncidentReport {
  version: 1;
  tree: string;
  title: string;
  profile: string;
  astronautId: number | null;
  patient: string;
  missionDay: number;
  startedAt: string;
  endedAt: string;
  likelyCauses: string[];
  vitals: Record<string, number>;
  cpr: { started: boolean; compressions: number; seconds: number };
  log: TriageLogEntry[];
  note: string;
}

export const VITAL_LABELS: Record<string, { label: string; unit: string; min: number; max: number }> = {
  spo2: { label: "SpO₂", unit: "%", min: 50, max: 100 },
  hr: { label: "Heart rate", unit: "bpm", min: 20, max: 250 },
  bp_sys: { label: "Systolic BP", unit: "mmHg", min: 40, max: 260 },
  bp_dia: { label: "Diastolic BP", unit: "mmHg", min: 20, max: 160 },
};

/** Match a spoken phrase against the commands a step accepts. */
export function matchVoice(transcript: string, node: TriageNode): { kind: "option"; index: number } | { kind: "back" | "repeat" | "cpr" } | null {
  const t = transcript.toLowerCase().trim();
  if (/\b(start|begin)\s+c\.?\s?p\.?\s?r\b|\bcpr\b/.test(t)) return { kind: "cpr" };
  if (/\b(go\s+)?back\b/.test(t)) return { kind: "back" };
  if (/\b(repeat|again|say that again)\b/.test(t)) return { kind: "repeat" };
  const yes = /\b(yes|yeah|yep|affirmative|done|ok|okay|correct)\b/.test(t);
  const no = /\b(no|nope|negative|skip)\b/.test(t);
  const stop = /\bstop\b/.test(t);
  const index = node.options.findIndex((o) => (o.voice === "yes" && yes) || (o.voice === "no" && no) || (o.voice === "stop" && stop) || t === o.label.toLowerCase());
  return index >= 0 ? { kind: "option", index } : null;
}

export function matchTree(transcript: string): string | null {
  const t = transcript.toLowerCase();
  for (const id of TREE_ORDER) if (TREES[id].voice_aliases.some((a) => t.includes(a))) return id;
  return null;
}
