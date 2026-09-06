"use client";

import { useState } from "react";
import { Popover } from "radix-ui";
import { CalendarDays } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { localDateKey, selectRangeDay } from "@/lib/date-range.mjs";
import "react-day-picker/style.css";
import "./date-range-filter.css";

const asDate = (value: string) => new Date(`${value}T12:00:00`);
const shortDate = (value: string) => asDate(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function DateRangeFilter({ from, to, onChange }: {
  from: string; to: string; onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState({ from, to });
  const [month, setMonth] = useState(from ? asDate(from) : new Date());
  const complete = !!range.from && !!range.to;
  const label = from && to ? `${shortDate(from)} – ${shortDate(to)}` : "Date range";
  const instruction = !range.from ? "Choose a start date" : !range.to ? "Choose an end date" : `${shortDate(range.from)} – ${shortDate(range.to)}`;

  return <Popover.Root open={open} onOpenChange={(next) => {
    if (next) { setRange({ from, to }); setMonth(from ? asDate(from) : new Date()); }
    setOpen(next);
  }}>
    <Popover.Trigger asChild>
      <button type="button" className="cc-calendar-trigger" aria-label={from && to ? `Discovery date range: ${from} to ${to}` : "Choose discovery date range"} title={label}>
        <CalendarDays size={16} aria-hidden="true" /><span>{label}</span>
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content className="cc-calendar-popover" align="end" sideOffset={6} collisionPadding={8} aria-label="Discovery date range">
        <p className="cc-calendar-prompt" aria-live="polite">{instruction}</p>
        <DayPicker mode="range" autoFocus month={month} onMonthChange={setMonth}
          selected={range.from ? { from: asDate(range.from), to: range.to ? asDate(range.to) : undefined } : undefined}
          onSelect={(_selected, day) => setRange((previous) => selectRangeDay(previous, localDateKey(day)))}
          showOutsideDays fixedWeeks
        />
        <div className="cc-calendar-footer">
          <button type="button" onClick={() => { onChange("", ""); setOpen(false); }}>Clear</button>
          <button type="button" className="cc-calendar-done" disabled={!complete} onClick={() => { if (complete) { onChange(range.from, range.to); setOpen(false); } }}>Done</button>
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}
