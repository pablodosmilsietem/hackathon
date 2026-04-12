export type Mood = "happy" | "neutral" | "angry";

export interface StatusPayload {
  activity: {
    contributions_last_24h: number;
    contributions_last_7d: number;
    interactions_last_7d: number;
    commits_today_utc: number;
    commits_this_week_utc: number;
    commits_in_events_feed: number;
  };
  mood: {
    mood: Mood;
    message: string;
  };
}

export declare const MOOD_EMOJI: Record<Mood, string>;
export declare const MOOD_LABEL: Record<Mood, string>;
export declare function normalizeStatusPayload(data: unknown): StatusPayload;
