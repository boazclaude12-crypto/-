export interface Clock {
  now(): Date;
  /** Resolves after `ms`. Injectable so tests never actually wait. */
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Deterministic clock for tests: time only moves when you move it. */
export class FixedClock implements Clock {
  constructor(private current: Date = new Date('2026-01-05T09:00:00.000Z')) {}
  now(): Date {
    return new Date(this.current);
  }
  async sleep(ms: number): Promise<void> {
    this.advance(ms);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
  set(date: Date): void {
    this.current = new Date(date);
  }
}
