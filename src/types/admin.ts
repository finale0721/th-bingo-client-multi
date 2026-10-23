import type { GameLogData } from "@/utils/Replay";

export interface AdminLoginResponse {
  token: string;
  username: string;
  expires_at: number;
}

export interface AdminGameRecordSummary {
  id: string;
  storage_month?: string | null;
  room_id: string;
  saved_at: number;
  save_reason: string;
  round_winner: number | null;
  round_winner_name: string | null;
  players: string[];
  game_type: number;
  game_type_name: string;
  score: number[];
  action_count: number;
  duration_ms: number;
  started_at: number | null;
  is_custom_game: boolean;
  has_game_log: boolean;
  board_size?: number;
}

export interface AdminGameRecord extends AdminGameRecordSummary {
  game_log: GameLogData | null;
}

export interface AdminMatchListResponse {
  total: number;
  items: AdminGameRecordSummary[];
}

export interface AdminMatchBatchResponse {
  total: number;
  items: AdminGameRecord[];
}

export interface AdminNamedCount {
  label: string;
  count: number;
}

export interface AdminDailyActivity {
  date: string;
  record_count: number;
  unique_players: number;
}

export interface AdminUserActivitySummary {
  player_name: string;
  match_count: number;
  replayable_count: number;
  finished_match_count: number;
  win_count: number;
  win_rate: number;
  active_days: number;
  latest_active_at: number;
  average_duration_ms: number;
}

export interface AdminUserOverviewResponse {
  total_records: number;
  replayable_records: number;
  finished_matches: number;
  unique_players: number;
  active_days: number;
  average_duration_ms: number;
  average_records_per_day: number;
  average_matches_per_user: number;
  top_active_users: AdminUserActivitySummary[];
  daily_activity: AdminDailyActivity[];
  month_distribution: AdminNamedCount[];
  save_reason_distribution: AdminNamedCount[];
  game_type_distribution: AdminNamedCount[];
}
