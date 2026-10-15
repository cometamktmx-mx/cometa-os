export function nextBusinessDay(date: Date) {
  const next = new Date(date);
  next.setDate(next.getDate() + (next.getDay() === 6 ? 2 : 1));
  if (next.getDay() === 0) next.setDate(next.getDate() + 1);
  return next;
}

export function fulfillmentDeadline(confirmedAt: Date) {
  const d = new Date(confirmedAt);
  const day = d.getDay();
  const hour = d.getHours();
  if (day === 0) { const monday = nextBusinessDay(d); monday.setHours(15, 0, 0, 0); return monday; }
  if (day === 6) { const saturday = new Date(d); saturday.setHours(12, 0, 0, 0); return hour < 12 ? saturday : nextBusinessDay(d); }
  if (hour < 14) { const same = new Date(d); same.setHours(16, 0, 0, 0); return same; }
  const next = nextBusinessDay(d); next.setHours(15, 0, 0, 0); return next;
}

export function isOverdue(deadline: string | Date | null | undefined, now = new Date()) {
  return Boolean(deadline && new Date(deadline).getTime() < now.getTime());
}
