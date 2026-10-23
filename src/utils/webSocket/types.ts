export interface WebSocketRequestData {
  action: WebSocketActionType;
  data: { [index: string]: any };
  echo: string;
}

export interface WebSocketResponseData {
  code: number;
  msg: string;
  data: { [index: string]: any };
  echo: string;
}

export interface WebSocketPushData {
  push_action: WebSocketPushActionType;
  data: { [index: string]: any };
}

export type WebSocketCallBack<T = any> = { (data?: T): void };

export interface HeartBeatOption {
  action: string;
  data: { [index: string]: any };
}

export enum WebSocketEventType {
  CONNECT = "connect",
  RECONNECT = "reconnect",
  DISCONNECT = "disconnect",
  ERROR = "error",
  OFFLINE = "offline",
}

export enum WebSocketActionType {
  HEART = "heart",
  LOGIN = "login",
  CREATE_ROOM = "create_room",
  GET_ROOM_CONFIG = "get_room_config",
  UPDATE_ROOM_CONFIG = "update_room_config",
  JOIN_ROOM = "join_room",
  GET_ROOM = "get_room",
  LEAVE_ROOM = "leave_room",
  STAND_UP = "stand_up",
  SIT_DOWN = "sit_down",
  SET_PHASE = "set_phase",
  GET_PHASE = "get_phase",
  START_GAME = "start_game",
  STOP_GAME = "stop_game",
  RESET_ROOM = "reset_room",
  GM_WARN_PLAYER = "gm_warn_player",
  UPDATE_CHANGE_CARD_COUNT = "update_change_card_count",
  GET_ALL_SPELLS = "get_all_spells",
  PAUSE = "pause",
  SET_DEBUG_SPELLS = "set_debug_spells",
  SELECT_SPELL = "select_spell",
  FINISH_SPELL = "finish_spell",
  UPDATE_SPELL_STATUS = "update_spell_status",
  START_BAN_PICK = "start_ban_pick",
  BAN_PICK = "ban_pick",
  REFRESH_SPELL = "refresh_one_spell",
  PRINT_LOG = "print_log",
  GET_ROOM_LIST = "get_room_list",

  //bp赛
  BP_GAME_BAN_PICK = "bp_game_ban_pick",
  BP_GAME_NEXT_ROUND = "bp_game_next_round",

  //normal 双重面板 切换按钮
  NORMAL_DUAL_BOARD_CHANGE = "normal_dual_board_change",

  //获取卡池
  GET_XLSX_DATA = "get_xlsx_data",
  START_CUSTOM_GAME = "start_custom_game",
  LINK_ROUTE = "link_route",
  LINK_UNDO = "link_undo",
  LINK_CONFIRM_ROUTE = "link_confirm_route",
  LINK_NEXT_CARD = "link_next_card",
  LINK_FINISH_CARD = "link_finish_card",
  LINK_SKIP_CARD = "link_skip_card",
  LINK_FORCE_SKIP = "link_force_skip",
  LINK_UNDO_FINISH = "link_undo_finish",
  LINK_SET_SKIP_USED = "link_set_skip_used",
  LINK_SET_PHASE = "link_set_phase",
  LINK_AI_SPEEDRUN = "link_ai_speedrun",
  LINK_TAKEOVER_ROUTE = "link_takeover_route",
  LINK_RELEASE_TAKEOVER = "link_release_takeover",
  UPLOAD_CUSTOM_POOL = "upload_custom_pool",
  LIST_CUSTOM_POOLS = "list_custom_pools",
  GET_CUSTOM_POOL = "get_custom_pool",
  DELETE_CUSTOM_POOL = "delete_custom_pool",
}

export enum WebSocketPushActionType {
  PUSH_UPDATE_ROOM_CONFIG = "push_update_room_config",
  PUSH_JOIN_ROOM = "push_join_room",
  PUSH_LEAVE_ROOM = "push_leave_room",
  PUSH_STAND_UP = "push_stand_up",
  PUSH_SIT_DOWN = "push_sit_down",
  PUSH_START_GAME = "push_start_game",
  PUSH_STOP_GAME = "push_stop_game",
  PUSH_RESET_ROOM = "push_reset_room",
  PUSH_GM_WARN_PLAYER = "push_gm_warn_player",
  PUSH_UPDATE_CHANGE_CARD_COUNT = "push_update_change_card_count",
  PUSH_PAUSE = "push_pause",
  PUSH_UPDATE_SEPLL_STATUS = "push_update_spell_status",
  PUSH_BAN_PICK = "push_ban_pick",
  PUSH_KICK = "push_kick",
  PUSH_PRINT_LOG = "push_print_log",
  PUSH_GET_ROOM_LIST = "push_get_room_list",
  PUSH_NORMAL_DUAL_BOARD_CHANGE = "push_normal_dual_board_change",
  PUSH_LINK_DATA = "push_link_data",
  PUSH_PLAYER_STATUS = "push_player_status",

  //bp赛
  PUSH_BP_GAME_NEXT_ROUND = "push_bp_game_next_round",
  PUSH_UPDATE_ONE_SPELL = "push_update_one_spell",
}
