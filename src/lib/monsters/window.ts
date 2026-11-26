/**
 * A timed window in the reader's own clock. Game hour H starts at real second H × 150 of every hour (a game day is one
 * real hour), the same in every time zone of whole hours, so the page needs only the window's seconds and the clock.
 */
export interface WindowSeconds {
  /** The real second of the hour the window opens. */
  start: number;
  /** The real second it closes (past 3600 when it runs into the next hour). */
  end: number;
}

/** A window of game hours [start, end) as its real seconds within the hour. */
export function windowSeconds(hours: readonly [number, number]): WindowSeconds {
  const [a, b] = hours;
  return { start: (a % 24) * 150, end: (b % 24) * 150 + (b <= a ? 3600 : 0) };
}

/** The window in progress or the next one, as Unix seconds: {open: true, until} or {open: false, at}. */
export function nextWindow(w: WindowSeconds, nowSec: number): { open: true; until: number } | { open: false; at: number } {
  const hour0 = nowSec - (nowSec % 3600);
  for (const base of [hour0 - 3600, hour0, hour0 + 3600]) {
    const s = base + w.start, e = base + w.end;
    if (nowSec < e) return nowSec >= s ? { open: true, until: e } : { open: false, at: s };
  }
  return { open: false, at: hour0 + 3600 + w.start };
}
