// A poll that stops while the tab is hidden and runs once when it shows again (if a tick was due), one run
// at a time, optionally spacing out, giving up after a deadline, or standing by while a stream tells
// instead. Pure: the timers and the page's visibility come in through `env`, so the rules are tested.

export interface PollEnv {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  hidden(): boolean;
  /** Calls back when the page shows or hides; returns the unsubscribe. */
  onVisibility(fn: () => void): () => void;
  now(): number;
}

export interface PollOptions {
  everyMs: number;
  /** Each run multiplies the delay by this, up to `maxMs` (no backoff by default). */
  factor?: number;
  maxMs?: number;
  /** Stop for good this long after the start. */
  deadlineMs?: number;
  /** Run at once on start (default true). */
  immediate?: boolean;
  /** A live stream that makes this poll a safety net: no tick while it is up, `minMs` apart at least while down. */
  gate?: PollGate;
  /** Back on the tab, run at once even if no tick was due (the member comes back from a sign-in tab). */
  runOnShow?: boolean;
}

export interface PollGate {
  live(): boolean;
  /** Calls back when `live` may have changed; returns the unsubscribe. */
  onChange(fn: () => void): () => void;
  minMs?: number;
}

/** The safety net's floor for a gated poll. */
export const GATE_MIN_MS = 15_000;

export interface Poller {
  stop(): void;
  /** Back to the first delay (something happened: poll closely again). */
  reset(): void;
  /** Run now, whatever the timer says (not while hidden). */
  kick(): void;
}

export function startPoll(fn: () => Promise<unknown> | unknown, opts: PollOptions, env: PollEnv): Poller {
  const started = env.now();
  const maxMs = Math.max(opts.maxMs ?? opts.everyMs, opts.everyMs);
  let delay = opts.everyMs;
  let timer: unknown = null;
  let running = false;
  let stopped = false;
  let lastRun = -Infinity;
  const gate = opts.gate;
  const floor = gate ? Math.max(gate.minMs ?? GATE_MIN_MS, 0) : 0;
  const wait = () => Math.max(delay, floor);
  const live = () => gate?.live() ?? false;

  const expired = () => opts.deadlineMs !== undefined && env.now() - started >= opts.deadlineMs;

  function schedule(ms: number): void {
    if (timer !== null) env.clearTimeout(timer);
    timer = stopped ? null : env.setTimeout(tick, ms);
  }

  async function run(): Promise<void> {
    if (running || stopped) return;
    if (expired()) return stop();
    running = true;
    lastRun = env.now();
    try {
      await fn();
    } catch {
      // A failed run is the next one's to retry.
    } finally {
      running = false;
    }
    if (stopped) return;
    delay = Math.min(delay * (opts.factor ?? 1), maxMs);
    if (!env.hidden() && !live()) schedule(wait());
  }

  function tick(): void {
    timer = null;
    // Hidden: nothing is asked; the page catches up once when it shows again. Stream up: it tells.
    if (env.hidden() || live()) return;
    void run();
  }

  // The stream went down: a full delay first (it is usually back within seconds); up: the net stops.
  const ungate = gate
    ? gate.onChange(() => {
        if (stopped || running) return;
        if (live()) {
          if (timer !== null) env.clearTimeout(timer);
          timer = null;
        } else if (!env.hidden() && timer === null) schedule(wait());
      })
    : () => undefined;

  const unsubscribe = env.onVisibility(() => {
    if (stopped) return;
    if (env.hidden()) {
      if (timer !== null) env.clearTimeout(timer);
      timer = null;
      return;
    }
    if (running || timer !== null) return;
    if (opts.runOnShow) return void run();
    if (live()) return;
    const due = env.now() - lastRun >= wait();
    if (due) void run();
    else schedule(wait() - (env.now() - lastRun));
  });

  function stop(): void {
    stopped = true;
    if (timer !== null) env.clearTimeout(timer);
    timer = null;
    unsubscribe();
    ungate();
  }

  if (opts.immediate === false || env.hidden()) {
    if (!env.hidden() && !live()) schedule(wait());
    lastRun = opts.immediate === false ? env.now() : -Infinity;
  } else {
    void run();
  }

  return {
    stop,
    reset() {
      delay = opts.everyMs;
      if (!running && !env.hidden() && !stopped && !live()) schedule(wait());
    },
    // Something happened (an event): read now, stream or not.
    kick() {
      if (!env.hidden()) void run();
    },
  };
}

/** The browser's timers and visibility. */
export function browserPollEnv(): PollEnv {
  return {
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (h) => window.clearTimeout(h as number),
    hidden: () => document.visibilityState === "hidden",
    onVisibility(fn) {
      document.addEventListener("visibilitychange", fn);
      return () => document.removeEventListener("visibilitychange", fn);
    },
    now: () => Date.now(),
  };
}
