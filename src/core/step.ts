/** Fixed step clock: 60 Hz, at most 4 steps per frame (a slow frame drops time, it never speeds the game up). */
export const DT = 1 / 60;
export const MAX_STEPS = 4;

export class StepClock {
  private acc = 0;
  /** Number of simulation steps to run for `frameSeconds` of real time. `ff` multiplies the speed (test flag). */
  steps(frameSeconds: number, ff = 1): number {
    this.acc += Math.min(frameSeconds, 0.25) * ff;
    let n = 0;
    while (this.acc >= DT && n < MAX_STEPS * Math.max(1, Math.ceil(ff))) { this.acc -= DT; n++; }
    if (n >= MAX_STEPS * Math.max(1, Math.ceil(ff))) this.acc = 0;
    return n;
  }
  reset(): void { this.acc = 0; }
}
