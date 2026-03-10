export function formatRelativeMinutes(minutes: number) {
  if (minutes >= 60) {
    const hours = minutes / 60;
    return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
  }

  return `${minutes}m`;
}

export function scheduleLabel(intervalMinutes: number) {
  return `Every ${formatRelativeMinutes(intervalMinutes)}`;
}
