export type Mood = "happy" | "neutral" | "angry" | "dead";

export interface PetTimer {
  seconds_remaining: number;
  initial_sec: number;
  commit_bonus_sec: number;
  window_sec: number;
  grace_remaining_sec: number;
  stale_in_sec: number | null;
  commits_last_5m: number;
  bar_denominator_sec?: number;
}

export interface StatusPayload {
  activity: {
    contributions_last_24h: number;
    contributions_last_7d: number;
    commits_last_5m: number;
    interactions_last_7d: number;
    commits_today_utc: number;
    commits_this_week_utc: number;
    commits_in_events_feed: number;
  };
  mood: {
    mood: Mood;
    message: string;
  };
  petTimer?: PetTimer;
}

export declare const MOOD_EMOJI: Record<Mood, string>;
export declare const MOOD_LABEL: Record<Mood, string>;
export declare function normalizeStatusPayload(data: unknown): StatusPayload;
