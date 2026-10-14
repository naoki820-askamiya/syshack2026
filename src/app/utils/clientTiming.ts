import { isCurrentAuthBoundary, subscribeAuthBoundary, type AuthBoundary } from './authBoundary.js';

export type TimingOrigin = 'submit' | 'reload' | 'retry';
export type TimingMilestone = 'submit' | 'case_ack' | 'state' | 'result_ready' | 'logical_finish';
export interface TimingToken { readonly trace: number }
export interface TimingLease extends TimingToken { readonly generation: number }
export interface ClientTimingEvent { trace: number; origin: TimingOrigin; milestone: TimingMilestone; elapsed_ms: number }
interface Trace { token: TimingToken; origin: TimingOrigin; boundary: AuthBoundary; start: number; last: number;
  caseId?: string; handoff: boolean; generation: number; active: boolean; releasing: boolean; finished: boolean; events: ClientTimingEvent[] }
interface Options { now: () => number; current: (boundary: AuthBoundary) => boolean;
  emit?: (event: ClientTimingEvent, start: number, end: number) => void; clear?: (trace: number) => void;
  defer?: (callback: () => void) => void }
const MILESTONES: TimingMilestone[] = ['submit', 'case_ack', 'state', 'result_ready', 'logical_finish'];

// Telemetry only: bounded private correlations; no text, IDs or auth boundary in exposed events.
export function createClientTiming(options: Options) {
  let serial = 0;
  const traces = new Map<number, Trace>();
  const safe = (operation: () => void) => { try { operation(); } catch { /* Measurement never changes business behavior. */ } };
  const clock = () => { try { const value = options.now(); return Number.isFinite(value) && value >= 0 ? value : null; } catch { return null; } };
  const valid = (trace: Trace) => { try { return options.current(trace.boundary); } catch { return false; } };
  const drop = (trace: Trace) => { traces.delete(trace.token.trace); safe(() => options.clear?.(trace.token.trace)); };
  const get = (token: TimingToken | null | undefined) => {
    const trace = token && traces.get(token.trace);
    if (!trace) return undefined;
    if (!valid(trace)) { drop(trace); return undefined; }
    return trace;
  };
  const record = (trace: Trace, milestone: TimingMilestone) => {
    if (!valid(trace) || trace.events.some(event => event.milestone === milestone)) return false;
    const end = clock(); if (end === null || end < trace.last) return false;
    trace.last = end;
    const event = { trace: trace.token.trace, origin: trace.origin, milestone, elapsed_ms: end - trace.start };
    trace.events.push(event); safe(() => options.emit?.({ ...event }, trace.start, end)); return true;
  };
  const begin = (origin: TimingOrigin, boundary: AuthBoundary): TimingToken | null => {
    const start = clock(); if (start === null || !['submit', 'reload', 'retry'].includes(origin)) return null;
    try { if (!options.current(boundary)) return null; } catch { return null; }
    if (traces.size >= 32) drop(traces.values().next().value!);
    const token = { trace: ++serial };
    const trace: Trace = { token, origin, boundary: { ...boundary }, start, last: start, handoff: false,
      generation: 0, active: false, releasing: false, finished: false, events: [] };
    traces.set(token.trace, trace);
    if (origin === 'submit') record(trace, 'submit');
    return token;
  };
  const find = (caseId: string, boundary: AuthBoundary) => [...traces.values()].find(trace =>
    trace.caseId === caseId && trace.boundary.userId === boundary.userId && trace.boundary.epoch === boundary.epoch && !trace.finished);
  const claim = (caseId: string, boundary: AuthBoundary): TimingLease | null => {
    const completedRelease = [...traces.values()].find(trace => trace.finished && trace.releasing && trace.caseId === caseId
      && trace.boundary.userId === boundary.userId && trace.boundary.epoch === boundary.epoch);
    const token = find(caseId, boundary)?.token ?? completedRelease?.token ?? begin('reload', boundary);
    const trace = get(token); if (!trace) return null;
    trace.caseId = caseId; trace.handoff = true; trace.active = true; trace.releasing = false;
    return { trace: trace.token.trace, generation: ++trace.generation };
  };
  const leased = (lease: TimingLease | null | undefined) => {
    const trace = get(lease); return trace && trace.active && trace.generation === lease?.generation && !trace.finished ? trace : undefined;
  };
  return {
    begin,
    ack(token: TimingToken | null, caseId: string) { const trace = get(token); if (!trace) return; trace.caseId = caseId; record(trace, 'case_ack'); },
    handoff(token: TimingToken | null) { const trace = get(token); if (trace) trace.handoff = true; },
    cancelSubmit(token: TimingToken | null) { const trace = get(token); if (trace && !trace.handoff) drop(trace); },
    fail(token: TimingToken | null) { const trace = get(token); if (trace && !trace.finished) { trace.active = false; trace.handoff = false; trace.finished = true; } },
    claim,
    stage(lease: TimingLease | null, milestone: 'state' | 'result_ready') {
      const trace = leased(lease); if (trace && ['state', 'result_ready'].includes(milestone)) record(trace, milestone);
    },
    finish(lease: TimingLease | null) {
      const trace = leased(lease); if (trace?.events.some(event => event.milestone === 'result_ready') && record(trace, 'logical_finish')) trace.finished = true;
    },
    release(lease: TimingLease | null) {
      const trace = get(lease); if (!trace || !trace.active || trace.generation !== lease?.generation) return;
      trace.active = false; trace.releasing = true;
      safe(() => (options.defer ?? queueMicrotask)(() => {
        safe(() => { if (traces.get(trace.token.trace) === trace && !trace.active && trace.generation === lease?.generation) {
          trace.releasing = false; if (!trace.finished) drop(trace);
        } });
      }));
    },
    retry(caseId: string, boundary: AuthBoundary) {
      const previous = find(caseId, boundary); if (previous) { previous.active = false; previous.finished = true; }
      const token = begin('retry', boundary); const trace = get(token); if (trace) { trace.caseId = caseId; trace.handoff = true; }
    },
    clear() { for (const trace of [...traces.values()]) drop(trace); },
    read(): ClientTimingEvent[] { return [...traces.values()].flatMap(trace => trace.events.map(event => ({ ...event }))); },
    size() { return traces.size; },
  };
}

const measureName = (trace: number, stage: TimingMilestone) => 'kigen.client.' + trace + '.' + stage;
// Retain a bounded name ledger even if platform clearing throws, so failed eviction cannot grow native entries.
const nativeNames = new Set<string>();
function clearNative(name: string) {
  try { performance.clearMeasures(name); nativeNames.delete(name); } catch { /* optional platform; keep its occupied slot */ }
}
export const clientTiming = createClientTiming({
  now: () => performance.now(), current: isCurrentAuthBoundary,
  emit: (event, start, end) => {
    const name = measureName(event.trace, event.milestone);
    if (nativeNames.size >= 160 || nativeNames.has(name)) return;
    performance.measure(name, { start, end, detail: event });
    nativeNames.add(name);
  },
  clear: trace => { for (const stage of MILESTONES) clearNative(measureName(trace, stage)); },
});
subscribeAuthBoundary(() => { try { clientTiming.clear(); for (const name of [...nativeNames]) clearNative(name); } catch { /* auth publication stays unchanged */ } });
