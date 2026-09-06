/** Two clicks complete a range; a third starts a fresh one. ISO dates sort locally. */
export function selectRangeDay(range, day) {
  if (!range.from || range.to) return { from: day, to: "" };
  return day < range.from
    ? { from: day, to: range.from }
    : { from: range.from, to: day };
}

export function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
