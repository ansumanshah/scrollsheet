import * as React from "react";

import { DatePickerSheet, PickerSheet } from "../registry/src/picker-wheel/picker-wheel";

const HOURS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
const MINUTES = Array.from({ length: 60 }, (_, i) => ({
  value: String(i),
  label: String(i).padStart(2, "0"),
}));
const MERIDIEM = [
  { value: "am", label: "AM" },
  { value: "pm", label: "PM" },
];

/**
 * Each column is a native scroll-snap track inside the sheet: fling it, tap a
 * row, or focus it and use the arrow keys. Cancel throws the draft away.
 */
export default function PickerWheelExample() {
  const [time, setTime] = React.useState(["7", "30", "am"]);
  const [date, setDate] = React.useState<Date | null>(null);

  return (
    <div className="ex-picker-demo">
      <PickerSheet
        title="Alarm"
        value={time}
        onValueChange={setTime}
        columns={[
          { id: "hour", label: "Hour", options: HOURS },
          { id: "minute", label: "Minute", options: MINUTES },
          { id: "meridiem", label: "AM or PM", options: MERIDIEM },
        ]}
        trigger={
          <button type="button" className="ex-trigger">
            Alarm: {time[0]}:{String(time[1]).padStart(2, "0")} {String(time[2]).toUpperCase()}
          </button>
        }
      />
      <DatePickerSheet value={date} onValueChange={setDate} title="Birthday" placeholder="Pick a birthday" />
    </div>
  );
}
