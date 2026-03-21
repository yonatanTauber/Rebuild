export function formatISODate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function formatLocalISODate(dateInput: string | Date) {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (!Number.isFinite(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${yyyy}-${mm}-${dd}`;
}

export function parseLocalISODate(dateInput: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput);
  if (!match) return new Date(dateInput);
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
}

export function formatDisplayDate(dateInput: string | Date) {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (!Number.isFinite(date.getTime())) return "-";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

export function formatDisplayDateTime(dateInput: string | Date) {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (!Number.isFinite(date.getTime())) return "-";
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${formatDisplayDate(date)}, ${hh}:${min}`;
}

export function daysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

export function addDaysISO(date: string, days: number) {
  const [year, month, day] = date.split("-").map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return date;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayISO(date: string) {
  const [year, month, day] = date.split("-").map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return 0;
  }
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function startOfTrainingWeekISO(date: string) {
  const weekday = weekdayISO(date);
  return addDaysISO(date, -weekday);
}

export function isSaturdayISO(date: string) {
  return weekdayISO(date) === 6;
}
