const timeFormatter = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const dayFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });

/** "14:30" biçiminde yerel saat. */
export function formatTime(iso: string | number): string {
  return timeFormatter.format(new Date(iso));
}

/** "29 Eylül Salı" biçiminde tarih. */
export function formatDay(iso: string | number): string {
  return dayFormatter.format(new Date(iso));
}
