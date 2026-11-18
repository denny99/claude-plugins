/**
 * Build progress with an estimate (pure): what the Studio's GPU is making for the build, step by step ("Bilder 12 von
 * 60 · noch ~18 min · fertig gegen 21:40"), the whole build, and the texter's entries (Claude, no GPU: count only).
 *
 * Sources, all seen by the mod's `tool.call` hooks after the call (the main thread's and every agent's calls alike):
 * - a step tool's answer (picture, picture_tool, paint_*, animate, make_3d, model_tool, make_sound): the job ids it
 *   queued; write_text answers at once, so its call is one finished job;
 * - `jobs wait`: which jobs are done (each job's `done`/results/error, or `finished` for all of them, or only a count);
 * - `prepare_table`: `made`/`total`/`failed` and `new` (lines made by this call) for the voices;
 * - `studio_status`: the Studio's GPU queue; jobs it lists that the mod did not see start (the Studio's own window,
 *   another session) are waited for first;
 * - the mod tool `build_progress`: an agent says how many it will make in all (the maler's 60 pictures before it has
 *   queued them) and, for the texter, how many entries the plan has.
 *
 * The estimate per kind is a moving mean of the last finished jobs of that kind. A job's time is its share of the GPU
 * time since the last job finished (the GPU makes one job after another, a queued job's waiting is not its time).
 * The GPU works first come, first served: a step is done when everything queued before it and itself is done.
 */
import type { GpuKind, ProgressState, TrackedJob } from "../types";

export type { GpuKind, ProgressState, TrackedJob };

export const KIND_DE: Record<GpuKind, string> = {
  picture: "Bilder",
  map: "Karten",
  refine: "Nachbessern",
  sound: "Klänge",
  voice: "Stimmen",
  clip: "Clips",
  "3d": "3D",
  text: "Texte (Studio)",
};

/** The Studio step tools that put work on the GPU, by tool name (without the MCP prefix). */
export const GPU_TOOLS: Record<string, GpuKind> = {
  picture: "picture",
  paint_player: "picture",
  paint_campaign: "picture",
  paint_map: "map",
  picture_tool: "refine",
  animate: "clip",
  make_3d: "3d",
  model_tool: "3d",
  make_sound: "sound",
  write_text: "text",
};

/** picture_tool actions that only look (no GPU job). */
const LOOK_ONLY = new Set(["find", "still_frame"]);

export const EMPTY_PROGRESS: ProgressState = {
  jobs: [],
  durations: {},
  lastEndAt: 0,
  voices: null,
  planned: {},
  entries: null,
  foreign: null,
};

/** How many finished jobs the moving mean takes. */
export const MEAN_OF = 8;
/** A kind idle this long starts a new step (its count from 0). */
export const BATCH_GAP_MS = 10 * 60_000;
/** An open job older than this is dropped (its end never reached the mod). */
export const JOB_TTL_MS = 3 * 3_600_000;
/** prepare_table / build_progress / studio_status answers older than this no longer count. */
export const REPORT_TTL_MS = 30 * 60_000;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const str = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : "";

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The GPU kind of a Studio call, or undefined when it makes nothing on the GPU. */
export function kindOfCall(tool: string, input: Obj): GpuKind | undefined {
  const kind = GPU_TOOLS[tool];
  if (kind === "refine" && LOOK_ONLY.has(str(input.action))) return undefined;
  return kind;
}

/** A job's kind from the Studio's words for it (studio_status `kind`/`feature`/`mode`). */
export function kindOfJob(job: Obj): GpuKind | null {
  const w = `${str(job.kind)} ${str(job.feature)} ${str(job.mode)}`.toLowerCase();
  if (/map|karte/.test(w)) return "map";
  if (/voice|line|speech|stimme|tts/.test(w)) return "voice";
  if (/sound|audio|music|klang/.test(w)) return "sound";
  if (/clip|video|animate/.test(w)) return "clip";
  if (/3d|model|mesh/.test(w)) return "3d";
  if (/refine|tool|upscale|sharpen|face/.test(w)) return "refine";
  if (/text|llm|ollama/.test(w)) return "text";
  if (/picture|image|bild/.test(w)) return "picture";
  return null;
}

/** The job ids a step tool's answer names (`id`, `job_id`, `job_ids`, `ids`, `jobs[].id`). */
export function startedIds(text: string): string[] {
  const data = parse(text);
  const out: string[] = [];
  const add = (v: unknown) => {
    const s = str(v);
    if (s && !out.includes(s)) out.push(s);
  };
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit);
    const o = obj(v);
    if (o.job_id !== undefined) add(o.job_id);
    else if (o.id !== undefined && (o.queued !== undefined || o.mode !== undefined || o.job !== undefined))
      add(o.id);
    for (const key of ["job_ids", "ids"])
      if (Array.isArray(o[key])) (o[key] as unknown[]).forEach(add);
    if (Array.isArray(o.jobs)) visit(o.jobs);
  };
  visit(data);
  return out;
}

/** Whether an answer reads as a refusal (no job started). */
export function isRefusal(text: string): boolean {
  const o = obj(parse(text));
  return !!o.error || /^(error|refused|models missing)/i.test(text.trim());
}

/** Drops open jobs older than the TTL and a kind's finished step once it starts anew after a pause. */
function tidy(s: ProgressState, now: number): ProgressState {
  return {
    ...s,
    jobs: s.jobs.filter((j) => j.endedAt !== undefined || now - j.startedAt < JOB_TTL_MS).slice(-400),
  };
}

/** A step tool queued `ids` (or, with none, finished at once: write_text, `startedAt` its call's start). */
export function noteStarted(
  s: ProgressState,
  kind: GpuKind,
  ids: string[],
  startedAt: number,
  now: number,
): ProgressState {
  let jobs = s.jobs;
  // a new step of this kind: the last one is all done and a while ago
  const mine = jobs.filter((j) => j.kind === kind);
  const lastEnd = Math.max(0, ...mine.map((j) => j.endedAt ?? Infinity));
  if (mine.length && lastEnd !== Infinity && now - lastEnd > BATCH_GAP_MS) {
    jobs = jobs.filter((j) => j.kind !== kind);
    const planned = { ...s.planned };
    if (planned[kind] && planned[kind]!.at < lastEnd) delete planned[kind];
    s = { ...s, planned };
  }
  if (!ids.length) {
    // finished in the call itself: one job, its time the call's
    const id = `sync-${kind}-${now}-${jobs.length}`;
    const next = { ...s, jobs: [...jobs, { id, kind, startedAt, endedAt: now }] };
    return tidy(withDuration(next, kind, now - startedAt, now), now);
  }
  const fresh = ids
    .filter((id) => !jobs.some((j) => j.id === id))
    .map((id) => ({ id, kind, startedAt: now }));
  return tidy({ ...s, jobs: [...jobs, ...fresh] }, now);
}

function withDuration(
  s: ProgressState,
  kind: GpuKind,
  ms: number,
  now: number,
): ProgressState {
  const list = [...(s.durations[kind] ?? []), Math.max(0, ms)].slice(-MEAN_OF);
  return {
    ...s,
    durations: { ...s.durations, [kind]: list },
    lastEndAt: Math.max(s.lastEndAt, now),
  };
}

/**
 * Jobs seen finished at `now`. Each one's time is its share of the GPU time since the later of the last finish and
 * the earliest start among them; failed ones end without a time.
 */
export function noteEnded(
  s: ProgressState,
  ended: { id: string; failed?: boolean }[],
  now: number,
): ProgressState {
  const open = ended
    .map((e) => ({ e, job: s.jobs.find((j) => j.id === e.id && j.endedAt === undefined) }))
    .filter((x): x is { e: { id: string; failed?: boolean }; job: TrackedJob } => !!x.job);
  if (!open.length) return s;
  const base = Math.max(s.lastEndAt, Math.min(...open.map((x) => x.job.startedAt)));
  const share = Math.max(0, now - base) / open.length;
  let out: ProgressState = {
    ...s,
    jobs: s.jobs.map((j) => {
      const hit = open.find((x) => x.job.id === j.id);
      return hit ? { ...j, endedAt: now, failed: hit.e.failed || undefined } : j;
    }),
  };
  for (const x of open)
    if (!x.e.failed) out = withDuration(out, x.job.kind, share, now);
  return { ...out, lastEndAt: now };
}

/** The jobs a `jobs wait` / `jobs cancel` answer says are over. */
export function endedOf(
  input: Obj,
  text: string,
  s: ProgressState,
): { id: string; failed?: boolean }[] {
  const asked = Array.isArray(input.job_ids) ? (input.job_ids as unknown[]).map(str).filter(Boolean) : [];
  if (str(input.action) === "cancel") return asked.map((id) => ({ id, failed: true }));
  const data = obj(parse(text));
  const listed = Array.isArray(data.jobs) ? (data.jobs as unknown[]).map(obj) : [];
  if (listed.length) {
    const out: { id: string; failed?: boolean }[] = [];
    for (const j of listed) {
      const id = str(j.id ?? j.job_id);
      if (!id) continue;
      const failed = !!j.error || /fail|error|cancel|stop|vanish/i.test(str(j.state ?? j.status));
      const over =
        failed ||
        j.done === true ||
        j.finished === true ||
        (Array.isArray(j.results) && j.results.length > 0) ||
        /done|finished|complete/i.test(str(j.state ?? j.status));
      if (over) out.push({ id, failed: failed || undefined });
    }
    return out;
  }
  if (data.finished === true) return asked.map((id) => ({ id }));
  // only a count: the first n of the asked jobs are done
  const count = num(data.done) ?? num(data.finished_count) ?? num(data.doneCount);
  if (count === undefined) return [];
  const already = asked.filter((id) => s.jobs.some((j) => j.id === id && j.endedAt !== undefined)).length;
  return asked
    .filter((id) => s.jobs.some((j) => j.id === id && j.endedAt === undefined))
    .slice(0, Math.max(0, count - already))
    .map((id) => ({ id }));
}

/** A prepare_table answer: voices made so far; `new` lines this call made take its time between them. */
export function noteVoices(
  s: ProgressState,
  json: Obj,
  callStart: number,
  now: number,
): ProgressState {
  const total = num(json.total);
  if (total === undefined) return s;
  const made = num(json.made) ?? num(json.done) ?? 0;
  const failedRaw = json.failed;
  const failed = Array.isArray(failedRaw) ? failedRaw.length : (num(failedRaw) ?? 0);
  const fresh = num(json.new) ?? Math.max(0, made - (s.voices?.made ?? made));
  const fresher = !s.voices || now - s.voices.at > REPORT_TTL_MS || made < s.voices.made;
  let out: ProgressState = {
    ...s,
    voices: { made, total, failed, at: now, since: fresher ? callStart : s.voices!.since },
  };
  if (fresh > 0) {
    const base = Math.max(callStart, s.lastEndAt);
    const per = Math.max(0, now - base) / fresh;
    for (let i = 0; i < Math.min(fresh, MEAN_OF); i++) out = withDuration(out, "voice", per, now);
  }
  return out;
}

/** studio_status's jobs: those the mod does not know wait in the queue too. */
export function noteQueue(s: ProgressState, status: Obj, now: number): ProgressState {
  if (!Array.isArray(status.jobs)) return s;
  const known = new Set(s.jobs.map((j) => j.id));
  const kinds = (status.jobs as unknown[])
    .map(obj)
    .filter((j) => !known.has(str(j.id ?? j.job_id)))
    .map(kindOfJob);
  return { ...s, foreign: { kinds, at: now } };
}

/** build_progress: an agent's planned total for a kind, or the texter's entries (step "texts"). */
export function notePlanned(
  s: ProgressState,
  step: string,
  total: number,
  done: number | undefined,
  now: number,
): ProgressState {
  if (step === "texts")
    return {
      ...s,
      entries: { total, done: done ?? (s.entries && now - s.entries.at < REPORT_TTL_MS ? s.entries.done : 0), at: now },
    };
  const kind = STEP_KIND[step];
  if (!kind) return s;
  return { ...s, planned: { ...s.planned, [kind]: { total, at: now } } };
}

/** The texter wrote `n` more entries (one set_campaign_entry call, several with `entries`). */
export function noteEntry(s: ProgressState, now: number, n = 1): ProgressState {
  if (!s.entries) return s;
  return { ...s, entries: { ...s.entries, done: s.entries.done + n, at: now } };
}

/** build_progress's step names. */
export const STEP_KIND: Record<string, GpuKind> = {
  pictures: "picture",
  maps: "map",
  refine: "refine",
  sounds: "sound",
  voices: "voice",
  clips: "clip",
  "3d": "3d",
  write_text: "text",
};

/** Moving mean of a kind's finished jobs (ms), undefined while none is finished. */
export function meanOf(s: ProgressState, kind: GpuKind): number | undefined {
  const list = s.durations[kind];
  if (!list?.length) return undefined;
  return list.reduce((a, b) => a + b, 0) / list.length;
}

export type StepProgress = {
  key: string;
  kind: GpuKind;
  label: string;
  done: number;
  total: number;
  /** Time until this step is done, the GPU's queue before it included; null: no job of its kind finished yet. */
  leftMs: number | null;
  /** Its own jobs' time only (ms), null as leftMs. */
  ownMs: number | null;
};

export type BuildProgress = {
  steps: StepProgress[];
  /** Whole build over the GPU steps: done, total, time left (null: none of them has an estimate yet). */
  total: { done: number; total: number; leftMs: number | null; partial: boolean } | null;
  /** Jobs in the Studio's queue the mod did not start (they go first). */
  foreign: number;
  /** The texter's entries (no time). */
  entries: { done: number; total: number } | null;
};

/** Everything that runs now, steps in the GPU's order (pure). */
export function buildProgress(s: ProgressState, now: number): BuildProgress {
  const raw: (StepProgress & { firstAt: number })[] = [];
  const kinds = [...new Set(s.jobs.map((j) => j.kind))];
  for (const kind of kinds) {
    if (kind === "voice") continue;
    const jobs = s.jobs.filter((j) => j.kind === kind);
    const open = jobs.filter((j) => j.endedAt === undefined);
    const planned = s.planned[kind];
    const plannedTotal = planned && now - planned.at < JOB_TTL_MS ? planned.total : 0;
    const done = jobs.length - open.length;
    const total = Math.max(jobs.length, plannedTotal);
    if (done >= total) continue;
    const mean = meanOf(s, kind);
    const ownMs = mean === undefined ? null : mean * (total - done);
    raw.push({
      key: `progress-${kind}`,
      kind,
      label: KIND_DE[kind],
      done,
      total,
      leftMs: null,
      ownMs,
      firstAt: Math.min(...(open.length ? open : jobs).map((j) => j.startedAt)),
    });
  }
  const v = s.voices;
  if (v && now - v.at < REPORT_TTL_MS && v.made + v.failed < v.total) {
    const mean = meanOf(s, "voice");
    const left = v.total - v.made - v.failed;
    raw.push({
      key: "progress-voice",
      kind: "voice",
      label: KIND_DE.voice,
      done: v.made,
      total: v.total,
      leftMs: null,
      ownMs: mean === undefined ? null : mean * left,
      firstAt: v.since,
    });
  }
  raw.sort((a, b) => a.firstAt - b.firstAt);
  const all = Object.values(s.durations).flat();
  const anyMean = all.length ? all.reduce((a, b) => a + b, 0) / all.length : undefined;
  const foreignKinds = s.foreign && now - s.foreign.at < REPORT_TTL_MS ? s.foreign.kinds : [];
  // the Studio's own queue goes first: each job at its kind's mean, else the mean over all kinds
  let ahead = foreignKinds.reduce(
    (sum, k) => sum + ((k && meanOf(s, k)) ?? anyMean ?? 0),
    0,
  );
  const steps: StepProgress[] = raw.map(({ firstAt: _f, ...st }) => {
    if (st.ownMs === null) return st;
    ahead += st.ownMs;
    return { ...st, leftMs: ahead };
  });
  const known = steps.filter((x) => x.ownMs !== null);
  const total = steps.length
    ? {
        done: steps.reduce((n, x) => n + x.done, 0),
        total: steps.reduce((n, x) => n + x.total, 0),
        leftMs: known.length ? ahead : null,
        partial: known.length < steps.length,
      }
    : null;
  const e = s.entries;
  return {
    steps,
    total,
    foreign: foreignKinds.length,
    entries: e && now - e.at < JOB_TTL_MS && e.done < e.total ? { done: e.done, total: e.total } : null,
  };
}

// --- words -------------------------------------------------------------------------------------------------------

export const ESTIMATE_PENDING = "Schätzung folgt";

/** "~18 min", "~1 h 20 min", "< 1 min". */
export function leftText(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return "< 1 min";
  if (min < 60) return `~${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `~${h} h ${m} min` : `~${h} h`;
}

/**
 * "21:40" in local time. `offsetMin` is Date's getTimezoneOffset (minutes behind UTC: -60 for CET); left out, the
 * computer's own zone at that moment.
 */
export function clockText(ms: number, offsetMin?: number): string {
  const off = offsetMin ?? new Date(ms).getTimezoneOffset();
  const t = new Date(ms - off * 60_000);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

/** "noch ~18 min · fertig gegen 21:40", or "Schätzung folgt" while no job of the kind is finished. */
export function etaText(
  leftMs: number | null,
  now: number,
  offsetMin?: number,
  partial = false,
): string {
  if (leftMs === null) return ESTIMATE_PENDING;
  return `noch ${partial ? "mind. " : ""}${leftText(leftMs)} · fertig gegen ${clockText(now + leftMs, offsetMin)}`;
}

/** "12 von 60". */
export const countText = (done: number, total: number): string => `${done} von ${total}`;

/**
 * The band's few words while something runs ("Stimmen 140/320 · ~18 min"), null while nothing runs. The step first
 * in the GPU's line speaks; the texter's entries only when no GPU step runs. Cut to `max` characters (Band v4: the
 * time goes before the count).
 */
export function bandProgress(p: BuildProgress, max: number): string | null {
  const head = p.steps[0];
  const parts: string[] = [];
  if (head) {
    parts.push(`${head.label} ${head.done}/${head.total}`);
    if (head.leftMs !== null) parts.push(leftText(head.leftMs));
  } else if (p.entries) parts.push(`Texte ${p.entries.done}/${p.entries.total}`);
  else return null;
  const full = parts.join(" · ");
  if ([...full].length <= max) return full;
  const tight = parts.join(" ");
  if ([...tight].length <= max) return tight;
  if ([...parts[0]!].length <= max) return parts[0]!;
  return `${[...parts[0]!].slice(0, Math.max(1, max - 1)).join("")}…`;
}
