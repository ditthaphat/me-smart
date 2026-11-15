export type TopicStatus = 'todo' | 'writing' | 'review' | 'done';
export type Chapter = { id: number; material_id: number; chapter_number: number; title: string; due_date: string | null };
export type Topic = { id: number; material_id: number; chapter_id: number; title: string; topic_status: TopicStatus };
export type ChapterState = 'unplanned' | 'done' | 'overdue' | 'due_today' | 'not_started' | 'in_progress';
export type ChapterSummary = { chapter: Chapter; topics: Topic[]; completed: number; total: number; percent: number | null; state: ChapterState };

function progressPercent(completed: number, total: number): number | null {
  if (!total) return null;
  return completed === total ? 100 : Math.min(99.9, Math.round(completed * 1000 / total) / 10);
}

export function bangkokDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function summarizeChapters(chapters: Chapter[], topics: Topic[], today = bangkokDate()) {
  const grouped = new Map<number, Topic[]>();
  for (const topic of topics) {
    const entries = grouped.get(topic.chapter_id);
    if (entries) entries.push(topic); else grouped.set(topic.chapter_id, [topic]);
  }
  const summaries: ChapterSummary[] = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number || a.id - b.id).map(chapter => {
    const entries = grouped.get(chapter.id) ?? [];
    const completed = entries.filter(topic => topic.topic_status === 'done').length;
    const total = entries.length;
    let state: ChapterState;
    if (!total) state = 'unplanned';
    else if (completed === total) state = 'done';
    else if (chapter.due_date && chapter.due_date < today) state = 'overdue';
    else if (chapter.due_date === today) state = 'due_today';
    else if (entries.every(topic => topic.topic_status === 'todo')) state = 'not_started';
    else state = 'in_progress';
    return { chapter, topics: entries, completed, total, percent: progressPercent(completed, total), state };
  });
  const total = summaries.reduce((sum, chapter) => sum + chapter.total, 0);
  const completed = summaries.reduce((sum, chapter) => sum + chapter.completed, 0);
  return { summaries, total, completed, percent: progressPercent(completed, total),
    overdue: summaries.filter(chapter => chapter.state === 'overdue').length,
    unplanned: summaries.filter(chapter => chapter.state === 'unplanned').length };
}
