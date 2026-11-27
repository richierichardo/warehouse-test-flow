const wibCalendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
});

export function todayInWib(now = new Date()) {
  const parts = wibCalendar.formatToParts(now);
  const datePart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${datePart("year")}-${datePart("month")}-${datePart("day")}`;
}

export function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function validCalendarDate(value: string) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = dateOnly(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function wibDayStart(value: string) {
  return new Date(`${value}T00:00:00+07:00`);
}
