export type ResearchTaskMeasure = { progress: number; weight: number | string };

/** Weights are relative: tasks with equal weight contribute equally. */
export function weightedProgress(tasks: ResearchTaskMeasure[]): number | null {
  let totalWeight = 0;
  let total = 0;
  for (const task of tasks) {
    const weight = Number(task.weight);
    if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(task.progress)) continue;
    totalWeight += weight;
    total += Math.min(100, Math.max(0, task.progress)) * weight;
  }
  return totalWeight ? Math.round(total / totalWeight * 10) / 10 : null;
}

/** Compare calendar dates in Thailand, not the browser's time zone. */
export function bangkokToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (name: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === name)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
