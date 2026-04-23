import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

function pad(n) {
  return String(n).padStart(2, "0");
}

function getRemaining(endsAt) {
  if (!endsAt) return { d: 0, h: 0, m: 0, s: 0, done: true };
  const diff = Math.max(0, endsAt - Date.now());
  const s = Math.floor(diff / 1000) % 60;
  const m = Math.floor(diff / 60000) % 60;
  const h = Math.floor(diff / 3600000) % 24;
  const d = Math.floor(diff / 86400000);
  return { d, h, m, s, done: diff === 0 };
}

function Segment({ value }) {
  return (
    <span className="flex items-center">
      <span className="font-mono text-xs font-bold tabular-nums bg-black/30 rounded px-1 py-0.5 min-w-5.5 text-center text-(--color-foreground)">
        {pad(value)}
      </span>
      <span className="text-primary/70 text-xs mx-0.5">:</span>
    </span>
  );
}

export default function CountdownTimer({ endsAt }) {
  const [time, setTime] = useState(() => getRemaining(endsAt));

  useEffect(() => {
    if (!endsAt) return;
    const interval = setInterval(() => setTime(getRemaining(endsAt)), 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  return (
    <div className="flex items-center gap-1">
      <Clock className="w-3 h-3 text-primary shrink-0" aria-hidden="true" />
      <span className="flex items-center">
        <Segment value={time.d} />
        <Segment value={time.h} />
        <Segment value={time.m} />
        <span className="font-mono text-xs font-bold tabular-nums bg-black/30 rounded px-1 py-0.5 min-w-5.5 text-center text-(--color-foreground)">
          {pad(time.s)}
        </span>
      </span>
    </div>
  );
}