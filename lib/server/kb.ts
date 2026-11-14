import fs from "node:fs";
import path from "node:path";
import { readSnapshot } from "@/lib/data/spaceWeather";

// Knowledge base: Markdown notes in content/kb/, one per NASA HRP risk.
// Search is plain keyword scoring — no vector database, works offline.

export interface KbNote {
  slug: string;
  title: string;
  /** "risk" for the 17 NASA HRP risks, "procedure" for other notes. */
  kind: string;
  /** How Hygieia covers this risk: monitored | self-check | knowledge-base. */
  coverage: string;
  source: string;
  sourceId: string;
  /** Tags matched against the OSDR snapshot for "Evidence in NASA OSDR" links. */
  osdrTags: string[];
  body: string;
}

export interface OsdrStudy {
  osd_id: string;
  title: string;
  organism: string;
  tissue: string;
  link: string;
  tags: string[];
}

const KB_DIR = path.join(process.cwd(), "content", "kb");

function parse(slug: string, raw: string): KbNote {
  const meta: Record<string, string> = {};
  let body = raw;
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (m) {
    body = m[2];
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return {
    slug,
    title: meta.title ?? slug,
    kind: meta.kind ?? "risk",
    coverage: meta.coverage ?? "knowledge-base",
    source: meta.source ?? "",
    sourceId: meta.source_id ?? "nasa-hrp-risks",
    osdrTags: (meta.osdr_tags ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    body: body.trim(),
  };
}

export function loadKb(): KbNote[] {
  try {
    return fs.readdirSync(KB_DIR).filter((f) => f.endsWith(".md")).sort()
      .map((f) => parse(f.replace(/\.md$/, ""), fs.readFileSync(path.join(KB_DIR, f), "utf8")));
  } catch {
    return [];
  }
}

export function loadOsdrStudies(): { fetched_at: string | null; studies: OsdrStudy[] } {
  const snap = readSnapshot<{ fetched_at: string; studies: OsdrStudy[] }>("osdr_studies.json");
  return { fetched_at: snap?.fetched_at ?? null, studies: snap?.studies ?? [] };
}

/** One to three OSDR studies for a note: human spaceflight datasets first. */
export function evidenceFor(note: KbNote, studies: OsdrStudy[], max = 3): OsdrStudy[] {
  if (note.osdrTags.length === 0) return [];
  const scored = studies
    .map((s) => ({ s, hits: note.osdrTags.filter((t) => s.tags.includes(t)).length, human: /homo sapiens/i.test(s.organism) ? 1 : 0 }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.human - a.human);
  return scored.slice(0, max).map((x) => x.s);
}

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "is", "it", "for", "on", "with", "what", "how", "do", "does", "i", "my", "me", "can", "be", "are", "about", "at", "this", "that"]);

export function searchKb(query: string, limit = 3): { note: KbNote; score: number; excerpt: string }[] {
  const terms = query.toLowerCase().split(/[^a-z0-9₂]+/).filter((t) => t.length > 1 && !STOP.has(t));
  if (terms.length === 0) return [];
  const notes = loadKb();
  const results = notes.map((note) => {
    const title = note.title.toLowerCase();
    const body = note.body.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += 5;
      score += Math.min(6, body.split(t).length - 1);
    }
    // Excerpt: the paragraph with the most matching terms.
    const paragraphs = note.body.split(/\n\s*\n/);
    let best = paragraphs[0] ?? "";
    let bestHits = -1;
    for (const p of paragraphs) {
      const hits = terms.filter((t) => p.toLowerCase().includes(t)).length;
      if (hits > bestHits) { bestHits = hits; best = p; }
    }
    return { note, score, excerpt: best.slice(0, 700) };
  });
  return results.filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}
