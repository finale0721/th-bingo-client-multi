import { useGameStore } from "@/store/GameStore";
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useRoomStore } from "@/store/RoomStore";
import { BingoType, CellSnapshot, CellView, GameData, GameStatus, LinkData, OneSpell, RoomConfig, Spell, SpellStatus, StandardData } from "@/types";
import ws from "@/utils/webSocket/WebSocketBingo";
import { WebSocketActionType, WebSocketPushActionType } from "@/utils/webSocket/types";
import Config from "@/config";
import pako from "pako";

export interface PlayerAction {
  playerName: string;
  actionType: string;
  spellIndex: number;
  spellName: string;
  timestamp: number;
  linkData?: LinkData | null;
  spell?: Spell; // 附加一个spell对象，方便处理
  scoreNow?: number[];
  team?: number | null;
  op?: string | null;
  board?: number | null;
  name?: string | null;
  affected_name?: string | null;
  victims?: string[];
  change_card_count?: number[] | null;
  cell_after?: CellSnapshot | null;
  cell_after_other?: CellSnapshot | null;
}

export interface GameLogData {
  roomConfig: RoomConfig;
  players: string[];
  spells: Spell[];
  spells2: Spell[] | null;
  normalData: {
    which_board_a: number;
    which_board_b: number;
    is_portal_a: number[];
    is_portal_b: number[];
    get_on_which_board: number[];
    extra_lines: number[][];
  } | null;
  actions: PlayerAction[];
  gameStartTimestamp: number;
  score: number[];
  initStatus: number[];
  isCustomGame: boolean | null;
  linkData?: LinkData | null;
  standard_data?: StandardData | null;
}

export interface ReplayPayload {
  version: string;
  data: GameLogData;
}

export interface ReadableLogBuildResult {
  content: string;
  logData: GameLogData;
  replayCode: string;
  fileName: string;
}

const REPLAY_DATA_VERSION = "1.1";

class Replay {
  private gameStore = useGameStore();
  private roomStore = useRoomStore();
  private originalRoomConfig = {
    rid: "", // 房间名
    type: BingoType.STANDARD, // 1-标准赛，2-BP赛，3-link赛
    game_time: 30, // 游戏总时间（不含倒计时），单位：分
    countdown: 5, // 倒计时，单位：秒
    games: [], // 含有哪些作品
    ranks: [], // 含有哪些游戏难度，也就是L卡和EX卡
    need_win: 3, // 需要胜利的局数，例如2表示bo3
    difficulty: 3, // 难度（影响不同星级的卡的分布），1对应E，2对应N，3对应L，4对应OD，5对应ODP，6对应自定义
    cd_time: 30, // 选卡cd，收卡后要多少秒才能选下一张卡
    cd_modifier_a: 0, // 左侧选手CD修正值
    cd_modifier_b: 0, // 右侧选手CD修正值
    reserved_type: 1, // 纯客户端用的一个类型字段，服务器只负责透传
    blind_setting: 1,
    spell_version: 2,
    dual_board: 0,
    portal_count: 5,
    blind_reveal_level: 2,
    diff_level: 3,
    use_ai: false,
    ai_strategy_level: 3,
    ai_style: 0,
    ai_base_power: 5,
    ai_experience: 5,
    ai_temperature: 0.0,
    game_weight: {},
    ai_preference: {},
    custom_level_count: [],
    board_size: 5,
    extra_line_count: 0,
    hidden_select_threshold_a: 5,
    hidden_select_threshold_b: 5,
  };
  private originalPlayerNames: string[] = Array(2).fill("");
  private originalRoomDataType: BingoType = BingoType.STANDARD;
  private originalTeams: any[] = [];
  private originalHost = "";
  private originalPractice = false;
  private originalRosterLocked = false;
  private originalScore: number[] = [0, 0];

  public isPlaying = false;

  private gameLogData: GameLogData | null = null;
  private actionIndex = 0;
  private speed: number = 1;
  private replayTimerId: number | null = null;
  private lastTickTime: number = 0;

  public state = reactive({
    isPlaying: false,
    isReplayFinished: false,
    currentTime: 0,
    totalTime: 0,
  });

  // 开始回放
  public startReplay(): void {
    if (!this.gameLogData) return;

    this.cleanupPreviousReplay();
    this.gameLogData = this.normalizeGameLog(this.gameLogData);
    this.gameStore.setReplayMode(true);
    this.roomStore.setReplayActive(true);

    //  备份当前房间配置和玩家名称
    for (const i in this.roomStore.roomConfig) {
      this.originalRoomConfig[i] = this.roomStore.roomConfig[i];
    }
    this.originalPlayerNames = [...this.roomStore.roomData.names];
    this.originalRoomDataType = this.roomStore.roomData.type;
    this.originalTeams = JSON.parse(JSON.stringify(this.roomStore.roomData.teams || []));
    this.originalHost = this.roomStore.roomData.host;
    this.originalPractice = this.roomStore.roomData.practice;
    this.originalRosterLocked = this.roomStore.roomData.roster_locked;
    this.originalScore = [...(this.roomStore.roomData.score || [0, 0])];

    //  设置回放用的房间配置和玩家名称
    for (const i in this.gameLogData.roomConfig) {
      this.roomStore.roomConfig[i] = this.gameLogData.roomConfig[i];
    }
    this.roomStore.roomData.names = [...this.gameLogData.players];
    this.roomStore.roomData.type = this.gameLogData.roomConfig.type;
    const standardTeams = this.gameLogData.standard_data?.teams;
    if (standardTeams && standardTeams.length >= 2) {
      this.roomStore.roomData.teams = standardTeams.map((team: any, index: number) => ({
        key: team.key || (index === 0 ? "A" : "B"),
        members: (team.members || []).map((m: any) => ({
          name: m.name,
          captain: !!m.captain,
          online: true,
        })),
        score: 0,
        change_card_count: 0,
      }));
      this.roomStore.roomData.names = [
        standardTeams[0]?.captain || standardTeams[0]?.members?.[0]?.name || this.gameLogData.players[0] || "",
        standardTeams[1]?.captain || standardTeams[1]?.members?.[0]?.name || this.gameLogData.players[1] || "",
      ];
    }
    this.roomStore.roomData.host = "";
    this.roomStore.roomData.practice = false;
    this.roomStore.roomData.roster_locked = false;
    this.roomStore.roomData.score = [0, 0];

    //  基于回放数据初始化游戏
    this.initGameData();

    //  初始化回放状态
    this.actionIndex = 0;
    this.state.totalTime = this.getTotalTime();
    this.state.currentTime = 0;
    this.state.isReplayFinished = false;
    this.state.isPlaying = true;
    this.speed = 1;

    //  启动计时器
    this.startReplayTimer();
  }

  // 启动/重启回放计时器
  private startReplayTimer(): void {
    if (this.replayTimerId) clearInterval(this.replayTimerId);

    this.lastTickTime = Date.now();
    this.replayTimerId = window.setInterval(() => {
      if (!this.state.isPlaying || !this.gameLogData) return;

      // 1. 基于增量时间和速度更新当前时间
      const now = Date.now();
      const deltaTime = now - this.lastTickTime;
      this.lastTickTime = now;
      this.state.currentTime += deltaTime * this.speed;

      // 2. 执行待处理的动作
      this.executePendingActions();

      // 3. 检查回放是否结束
      if (this.actionIndex >= this.gameLogData.actions.length) {
        this.state.isReplayFinished = true;
        this.state.isPlaying = false;
        if (this.replayTimerId) {
          clearInterval(this.replayTimerId);
          this.replayTimerId = null;
        }
      }
    }, 10);
  }

  // 暂停回放
  public pauseReplay(): void {
    this.state.isPlaying = false;
    if (this.replayTimerId) {
      clearInterval(this.replayTimerId);
      this.replayTimerId = null;
    }
  }

  // 恢复回放
  public resumeReplay(): void {
    if (!this.state.isPlaying && !this.state.isReplayFinished) {
      this.state.isPlaying = true;
      this.startReplayTimer();
    }
  }

  // 设定速度 (已简化)
  public setSpeed(speed: number): void {
    this.speed = speed;
  }

  // 执行待处理的动作
  private executePendingActions(): void {
    if (!this.gameLogData) return;

    const actions = this.gameLogData.actions;

    // 执行所有应该在当前时间之前执行的动作
    // 使用 this.state.currentTime 进行判断
    while (this.actionIndex < actions.length && actions[this.actionIndex].timestamp <= this.state.currentTime) {
      this.executeAction(actions[this.actionIndex]);
      this.actionIndex++;
    }
  }

  // 初始化游戏数据
  private initGameData(): void {
    if (!this.gameLogData) return;

    // 设置spells和spells2
    this.gameStore.spells = [...this.gameLogData.spells];
    if (this.gameLogData.spells2) {
      this.gameStore.spells2 = [...this.gameLogData.spells2];
    } else {
      this.gameStore.spells2 = [];
    }

    // 设置normalData
    if (this.gameLogData.normalData) {
      for (const i in this.gameLogData.normalData) {
        this.gameStore.normalGameData[i] = this.gameLogData.normalData[i];
      }
    } else {
      this.gameStore.normalGameData.is_portal_a = [];
      this.gameStore.normalGameData.is_portal_b = [];
      this.gameStore.normalGameData.get_on_which_board = [];
      this.gameStore.normalGameData.extra_lines = [];
    }

    const standard = this.gameLogData.standard_data;
    if (standard) {
      this.gameStore.cells = (standard.cells || []).map((cell, index) => {
        const view = this.snapshotToView(cell);
        view.index = index;
        return view;
      });
      this.gameStore.cells2 = (standard.cells2 || []).map((cell, index) => {
        const view = this.snapshotToView(cell);
        view.index = index;
        return view;
      });
      this.gameStore.extraLines = standard.extra_lines || [];
      this.gameStore.captureStandard = standard.capture_standard || 1;
      this.gameStore.mySelectedIndex = -1;
      this.gameStore.mySelectedBoard = 0;
      this.gameStore.myTeam = null;
      this.gameStore.changeCardCount = [0, 0];
      this.gameStore.changePending = false;
    }
    // 旧回放兼容
    this.gameStore.spellStatus = [...(this.gameLogData.initStatus || [])];
    this.applyReplayLinkData(this.gameLogData.linkData);

    // 标记游戏开始
    this.roomStore.roomData.started = true;
    this.gameStore.gameStatus = GameStatus.STARTED;
    this.gameStore.leftTime = this.roomStore.roomConfig.game_time * 1000 * 60 * 9;
  }

  // 执行单个操作
  private applyReplayLinkData(data?: LinkData | null): void {
    if (this.gameLogData?.roomConfig.type !== BingoType.LINK) return;

    const source = data || this.gameLogData?.linkData || null;
    const boardSize = this.gameLogData?.roomConfig.board_size || 5;
    const area = boardSize * boardSize;
    const empty: LinkData = {
      link_idx_a: [],
      link_idx_b: [],
      start_ms_a: 0,
      end_ms_a: 0,
      event_a: 0,
      start_ms_b: 0,
      end_ms_b: 0,
      event_b: 0,
      route_confirmed_a: false,
      route_confirmed_b: false,
      current_step_a: 0,
      current_step_b: 0,
      status_a: Array(area).fill(0),
      status_b: Array(area).fill(0),
      last_get_time_a: 0,
      last_get_time_b: 0,
      skip_used_a: 0,
      skip_used_b: 0,
      skipped_idx_a: [],
      skipped_idx_b: [],
      score_a: 0,
      score_b: 0,
      disabled_idx: [],
      takeover_player_index: -1,
    };
    const next: LinkData = {
      ...empty,
      ...(source || {}),
      link_idx_a: [...(source?.link_idx_a || [])],
      link_idx_b: [...(source?.link_idx_b || [])],
      status_a: this.fitArray(source?.status_a, area, 0),
      status_b: this.fitArray(source?.status_b, area, 0),
      skipped_idx_a: [...(source?.skipped_idx_a || [])],
      skipped_idx_b: [...(source?.skipped_idx_b || [])],
      disabled_idx: [...(source?.disabled_idx || [])],
    };
    const linkData = next as unknown as Record<string, unknown>;
    const target = this.gameStore.linkGameData as unknown as Record<string, unknown>;
    for (const key in linkData) {
      const value = linkData[key];
      target[key] = Array.isArray(value) ? [...value] : value;
    }
    this.roomStore.roomData.score = [Math.floor(next.score_a || 0), Math.floor(next.score_b || 0)];
  }

  private snapshotToView(cell: CellSnapshot): CellView {
    return {
      index: 0,
      selected_by_a: [...(cell?.selected_by_a || [])],
      selected_by_b: [...(cell?.selected_by_b || [])],
      capture_count_a: cell?.capture_count_a ?? null,
      capture_count_b: cell?.capture_count_b ?? null,
      captured_by_a: !!cell?.captured_by_a,
      captured_by_b: !!cell?.captured_by_b,
      fully_captured_by: cell?.fully_captured_by ?? null,
      my_selected: false,
      content_reveal: 4,
    };
  }

  private applyCellAfter(action: PlayerAction): void {
    if (!action.cell_after) return;
    const board = action.board ?? 0;
    const index = action.spellIndex;
    if (index < 0) return;
    const next = this.snapshotToView(action.cell_after);
    next.index = index;
    // 回放展示完整信息
    next.content_reveal = 4;
    const otherBoard = 1 - board;
    const list = board === 1 ? this.gameStore.cells2 : this.gameStore.cells;
    const copy = [...list];
    copy[index] = next;
    if (board === 1) this.gameStore.cells2 = copy;
    else this.gameStore.cells = copy;
    if (action.cell_after_other) {
      const otherView = this.snapshotToView(action.cell_after_other);
      otherView.index = index;
      otherView.content_reveal = 4;
      const otherList = otherBoard === 1 ? this.gameStore.cells2 : this.gameStore.cells;
      const otherCopy = [...otherList];
      otherCopy[index] = otherView;
      if (otherBoard === 1) this.gameStore.cells2 = otherCopy;
      else this.gameStore.cells = otherCopy;
    }
    if (action.change_card_count) {
      this.gameStore.changeCardCount = [...action.change_card_count];
    }
  }

  private executeAction(action: PlayerAction): void {
    if (this.gameLogData?.roomConfig.type === BingoType.LINK && action.linkData) {
      this.applyReplayLinkData(action.linkData);
      return;
    }
    // 标准赛：状态完全由 cellAfter 快照决定
    if (this.gameLogData?.standard_data) {
      const op = action.op || action.actionType;
      if (op === "pause") this.handlePause();
      else if (op === "resume") this.handleResume();
      else this.applyCellAfter(action);
      return;
    }

    switch (action.actionType.split("-")[0]) {
      case "select":
        this.handleSelect(action);
        break;
      case "finish":
      case "contest_win":
        this.handleFinish(action);
        break;
      case "pause":
        this.handlePause();
        break;
      case "resume":
        this.handleResume();
        break;
      case "set":
        this.handleSetSpellStatus(action);
        break;
    }
  }

  // 处理选择操作
  private handleSelect(action: PlayerAction): void {
    const playerIndex = this.gameLogData?.players.indexOf(action.playerName) || 0;
    if (playerIndex === 0) {
      this.gameStore.spellStatus[action.spellIndex] =
        this.gameStore.spellStatus[action.spellIndex] === SpellStatus.B_SELECTED
          ? SpellStatus.BOTH_SELECTED
          : SpellStatus.A_SELECTED;
    } else {
      this.gameStore.spellStatus[action.spellIndex] =
        this.gameStore.spellStatus[action.spellIndex] === SpellStatus.A_SELECTED
          ? SpellStatus.BOTH_SELECTED
          : SpellStatus.B_SELECTED;
    }
  }

  // 处理完成操作
  private handleFinish(action: PlayerAction): void {
    const playerIndex = this.gameLogData?.players.indexOf(action.playerName) || 0;
    this.gameStore.spellStatus[action.spellIndex] = playerIndex === 0 ? SpellStatus.A_ATTAINED : SpellStatus.B_ATTAINED;
  }

  // 处理暂停操作
  private handlePause(): void {
    this.gameStore.gameStatus = GameStatus.PAUSED;
  }

  // 处理恢复操作
  private handleResume(): void {
    this.gameStore.gameStatus = GameStatus.STARTED;
  }

  // 处理设置spellStatus操作
  private handleSetSpellStatus(action: PlayerAction): void {
    const status = parseInt(action.actionType.split("-")[1], 10);
    this.gameStore.spellStatus[action.spellIndex] = status;
  }

  // 结束回放
  public endReplay(): void {
    this.pauseReplay(); // 先暂停并清理计时器
    this.state.isReplayFinished = false;
    this.gameStore.setReplayMode(false);
    this.roomStore.setReplayActive(false);
    this.roomStore.roomData.started = false;

    // 恢复原始房间配置和玩家名称
    for (const i in this.originalRoomConfig) {
      this.roomStore.roomConfig[i] = this.originalRoomConfig[i];
    }
    this.roomStore.roomData.names = [...this.originalPlayerNames];
    this.roomStore.roomData.type = this.originalRoomDataType;
    this.roomStore.roomData.teams = this.originalTeams;
    this.roomStore.roomData.host = this.originalHost;
    this.roomStore.roomData.practice = this.originalPractice;
    this.roomStore.roomData.roster_locked = this.originalRosterLocked;
    this.roomStore.roomData.score = [...this.originalScore];

    // 重置游戏状态
    this.gameStore.resetGameData();
  }

  // 获取总时间（用于UI显示）
  public getTotalTime(): number {
    if (!this.gameLogData || this.gameLogData.actions.length === 0) return 0;
    return this.gameLogData.actions[this.gameLogData.actions.length - 1].timestamp;
  }

  public getReplayWallTime(): number {
    if (!this.gameLogData) return Date.now();
    return this.gameLogData.gameStartTimestamp + this.state.currentTime;
  }

  private cleanupPreviousReplay(): void {
    // 清理计时器
    if (this.replayTimerId) {
      clearInterval(this.replayTimerId);
      this.replayTimerId = null;
    }

    // 重置所有状态变量
    this.actionIndex = 0;
    this.isPlaying = false;

    // 重置游戏状态
    this.gameStore.resetGameData();
  }

  // 跳转到指定时间点
  public jumpToTime(timestamp: number): void {
    if (!this.gameLogData) return;

    // 暂停回放，防止在状态计算时发生冲突
    const wasPlaying = this.state.isPlaying;
    if (wasPlaying) {
      this.pauseReplay();
    }

    // 重置游戏数据到初始状态
    this.initGameData();

    // 设置当前时间
    this.state.currentTime = timestamp;

    // 从头开始执行所有在目标时间戳之前的 actions
    this.actionIndex = 0;
    const actions = this.gameLogData.actions;

    while (this.actionIndex < actions.length && actions[this.actionIndex].timestamp <= timestamp) {
      this.executeAction(actions[this.actionIndex]);
      this.actionIndex++;
    }

    // 更新回放结束状态
    this.state.isReplayFinished =
      this.actionIndex >= this.gameLogData.actions.length && timestamp >= this.state.totalTime;

    // 如果之前是播放状态，则恢复播放
    if (wasPlaying && !this.state.isReplayFinished) {
      this.resumeReplay();
    }
  }

  public jumpToPreviousAction(): void {
    if (!this.gameLogData || this.gameLogData.actions.length === 0) {
      return;
    }
    if (this.actionIndex <= 1) {
      this.jumpToTime(0);
      return;
    }
    this.jumpToTime(this.gameLogData.actions[this.actionIndex - 2].timestamp);
  }

  public jumpToNextAction(): void {
    if (!this.gameLogData || this.gameLogData.actions.length === 0) {
      return;
    }
    if (this.actionIndex >= this.gameLogData.actions.length) {
      this.jumpToTime(this.state.totalTime);
      return;
    }
    this.jumpToTime(this.gameLogData.actions[this.actionIndex].timestamp);
  }

  public uint8ArrayToBase64 = (array: Uint8Array): string => {
    // 将每个字节转换为字符
    let binaryString = "";
    for (let i = 0; i < array.length; i++) {
      binaryString += String.fromCharCode(array[i]);
    }
    // 使用 btoa 进行Base64编码
    return btoa(binaryString);
  };

  public formatStringWithLineBreaks = (str: string, lineLength: number): string => {
    const regex = new RegExp(`.{1,${lineLength}}`, "g");
    const lines = str.match(regex);
    return lines ? lines.join("\n") : "";
  };

  private inferBoardSize = (roomConfig: Partial<RoomConfig> | undefined, logObject: Partial<GameLogData>): number => {
    const explicit = Number(roomConfig?.board_size);
    if ([4, 5, 6].includes(explicit)) return explicit;

    const candidates = [logObject.spells?.length, logObject.initStatus?.length, logObject.spells2?.length].filter(
      (value): value is number => typeof value === "number" && value > 0
    );
    for (const length of candidates) {
      const size = Math.sqrt(length);
      if (Number.isInteger(size) && [4, 5, 6].includes(size)) return size;
    }
    return 5;
  };

  private fitArray = <T>(source: T[] | undefined, length: number, fillValue: T): T[] => {
    const result = Array.isArray(source) ? source.slice(0, length) : [];
    while (result.length < length) {
      result.push(fillValue);
    }
    return result;
  };

  private normalizeRoomConfig = (roomConfig: Partial<RoomConfig> | undefined, logObject: Partial<GameLogData>): RoomConfig => {
    const boardSize = this.inferBoardSize(roomConfig, logObject);
    const normalData = logObject.normalData as GameLogData["normalData"] | undefined;
    return {
      ...this.originalRoomConfig,
      ...(roomConfig || {}),
      board_size: boardSize,
      extra_line_count: roomConfig?.extra_line_count ?? normalData?.extra_lines?.length ?? 0,
      hidden_select_threshold_a: roomConfig?.hidden_select_threshold_a ?? this.defaultHiddenThreshold(boardSize),
      hidden_select_threshold_b: roomConfig?.hidden_select_threshold_b ?? this.defaultHiddenThreshold(boardSize),
      games: Array.isArray(roomConfig?.games) ? roomConfig!.games : [],
      ranks: Array.isArray(roomConfig?.ranks) ? roomConfig!.ranks : [],
      game_weight: roomConfig?.game_weight || {},
      ai_preference: roomConfig?.ai_preference || {},
      custom_level_count: Array.isArray(roomConfig?.custom_level_count) ? roomConfig!.custom_level_count : [],
    } as RoomConfig;
  };

  private defaultHiddenThreshold = (boardSize: number): number => {
    if (boardSize === 4) return 3;
    if (boardSize === 6) return 7;
    return 5;
  };

  private normalizePlayers = (players: string[] | undefined): string[] => {
    const normalized = this.fitArray(players, 2, "");
    normalized[0] = normalized[0] || "PlayerA";
    normalized[1] = normalized[1] || "PlayerB";
    return normalized;
  };

  private scoreFromStatus = (statuses: number[]): number[] => {
    return statuses.reduce(
      (score, status) => {
        if (status === SpellStatus.A_ATTAINED) score[0]++;
        else if (status === SpellStatus.B_ATTAINED) score[1]++;
        else if (status === SpellStatus.BOTH_ATTAINED) {
          score[0]++;
          score[1]++;
        }
        return score;
      },
      [0, 0]
    );
  };

  private normalizeLinkData = (linkData: Partial<LinkData> | undefined | null, area: number): LinkData | null => {
    if (!linkData) return null;
    const fitNumbers = (source: unknown, fillValue = 0) =>
      this.fitArray(Array.isArray(source) ? (source as number[]) : [], area, fillValue);
    const cleanRoute = (source: unknown) =>
      Array.isArray(source)
        ? (source as number[]).filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < area)
        : [];

    return {
      link_idx_a: cleanRoute(linkData.link_idx_a),
      link_idx_b: cleanRoute(linkData.link_idx_b),
      start_ms_a: Number(linkData.start_ms_a || 0),
      end_ms_a: Number(linkData.end_ms_a || 0),
      event_a: Number(linkData.event_a || 0),
      start_ms_b: Number(linkData.start_ms_b || 0),
      end_ms_b: Number(linkData.end_ms_b || 0),
      event_b: Number(linkData.event_b || 0),
      route_confirmed_a: Boolean(linkData.route_confirmed_a),
      route_confirmed_b: Boolean(linkData.route_confirmed_b),
      current_step_a: Number(linkData.current_step_a || 0),
      current_step_b: Number(linkData.current_step_b || 0),
      status_a: fitNumbers(linkData.status_a),
      status_b: fitNumbers(linkData.status_b),
      last_get_time_a: Number(linkData.last_get_time_a || 0),
      last_get_time_b: Number(linkData.last_get_time_b || 0),
      skip_used_a: Number(linkData.skip_used_a || 0),
      skip_used_b: Number(linkData.skip_used_b || 0),
      skipped_idx_a: cleanRoute(linkData.skipped_idx_a),
      skipped_idx_b: cleanRoute(linkData.skipped_idx_b),
      score_a: Number(linkData.score_a || 0),
      score_b: Number(linkData.score_b || 0),
      disabled_idx: cleanRoute(linkData.disabled_idx),
      takeover_player_index: Number(linkData.takeover_player_index ?? -1),
    };
  };

  private normalizeActions = (
    actions: PlayerAction[] | undefined,
    players: string[],
    initStatus: number[],
    area: number
  ): PlayerAction[] => {
    const statuses = [...initStatus];
    let runningScore = this.scoreFromStatus(statuses);

    return (Array.isArray(actions) ? actions : []).map((rawAction) => {
      const action = { ...rawAction };
      const spellIndex = Number.isInteger(action.spellIndex) ? action.spellIndex : -1;
      const playerIndex = players.indexOf(action.playerName);

      if (!Array.isArray(action.scoreNow) || action.scoreNow.length < 2) {
        if (spellIndex >= 0 && spellIndex < statuses.length) {
          if (action.actionType === "finish" || action.actionType === "contest_win") {
            if (playerIndex === 0) statuses[spellIndex] = SpellStatus.A_ATTAINED;
            else if (playerIndex === 1) statuses[spellIndex] = SpellStatus.B_ATTAINED;
          } else if (action.actionType?.startsWith("set-")) {
            const status = Number.parseInt(action.actionType.split("-")[1], 10);
            if (Number.isInteger(status)) statuses[spellIndex] = status;
          }
          runningScore = this.scoreFromStatus(statuses);
        }
        action.scoreNow = [...runningScore];
      } else {
        action.scoreNow = this.fitArray(action.scoreNow, 2, 0);
        runningScore = [...action.scoreNow];
      }
      action.linkData = this.normalizeLinkData(action.linkData, area);

      return action;
    });
  };

  private normalizeNormalData = (
    normalData: GameLogData["normalData"] | undefined | null,
    roomConfig: RoomConfig,
    area: number
  ): GameLogData["normalData"] => {
    if (!normalData && roomConfig.type !== BingoType.STANDARD) return null;

    const boardSize = roomConfig.board_size || 5;
    const extraLines = Array.isArray(normalData?.extra_lines)
      ? normalData!.extra_lines
          .filter((line): line is number[] => Array.isArray(line))
          .map((line) => Array.from(new Set(line.filter((cell) => Number.isInteger(cell) && cell >= 0 && cell < area))))
          .filter((line) => line.length >= 4)
      : [];

    return {
      which_board_a: normalData?.which_board_a ?? 0,
      which_board_b: normalData?.which_board_b ?? 0,
      is_portal_a: this.fitArray(normalData?.is_portal_a, area, 0),
      is_portal_b: this.fitArray(normalData?.is_portal_b, area, 0),
      get_on_which_board: this.fitArray(normalData?.get_on_which_board, area, 0),
      extra_lines: extraLines.map((line) => line.slice(0, Math.max(boardSize, 4))),
    };
  };

  public parseReplayData = (replayCodeBlock: string, loadData: boolean=true): ReplayPayload | null => {
    try {
      // 1. 匹配并提取所有Base64有效字符，自动忽略换行、空格等无效字符
      // [A-Za-z0-9+/=] 是Base64字符集。我们把它们拼接成一个干净的字符串。
      const validBase64Chars = replayCodeBlock.match(/[A-Za-z0-9+/=]/g);
      if (!validBase64Chars) {
        throw new Error("无效的回放输入");
      }
      const cleanBase64 = validBase64Chars.join("");

      // 2. Base64 解码 -> 二进制字符串
      const binaryString = atob(cleanBase64);

      // 3. 二进制字符串 -> Uint8Array
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // 4. Pako 解压缩 -> 原始JSON字符串
      const jsonString = pako.inflate(bytes, { to: "string" });

      // 5. 解析JSON字符串为对象
      const parsedPayload: ReplayPayload | GameLogData = JSON.parse(jsonString);

      const version =
        typeof (parsedPayload as ReplayPayload).version === "string" ? (parsedPayload as ReplayPayload).version : "1.0";
      const rawData =
        typeof (parsedPayload as ReplayPayload).data === "object" ? (parsedPayload as ReplayPayload).data : parsedPayload;
      if (typeof rawData !== "object" || rawData === null) {
        throw new Error("Invalid replay data");
      }
      const normalizedData = this.normalizeGameLog(rawData as GameLogData);

      console.log(`成功解析回放数据，版本号: ${version}`);

      if(loadData) this.gameLogData = normalizedData;

      return {
        version,
        data: normalizedData,
      };
    } catch (error) {
      throw new Error("回放数据解析错误");
      return null;
    }
  };

  public normalizeGameLog = (logObject: GameLogData): GameLogData => {
    if (typeof logObject !== "object" || logObject === null) {
      throw new Error("收到的日志格式不正确，期望是一个对象");
    }

    const roomConfig = this.normalizeRoomConfig(logObject.roomConfig, logObject);
    const area = roomConfig.board_size * roomConfig.board_size;
    const players = this.normalizePlayers(logObject.players);
    const initStatus = this.fitArray(logObject.initStatus, area, SpellStatus.NONE);
    const normalizedActions = this.normalizeActions(logObject.actions, players, initStatus, area);
    const lastLinkAction = normalizedActions
      .slice()
      .reverse()
      .find((action) => action.linkData);
    const normalizedLog: GameLogData = {
      ...logObject,
      roomConfig,
      players,
      spells: Array.isArray(logObject.spells) ? [...logObject.spells] : [],
      spells2: Array.isArray(logObject.spells2) ? [...logObject.spells2] : null,
      normalData: this.normalizeNormalData(logObject.normalData, roomConfig, area),
      actions: normalizedActions,
      score: this.fitArray(logObject.score, 2, 0),
      initStatus,
      isCustomGame: logObject.isCustomGame ?? false,
      linkData: lastLinkAction?.linkData || this.normalizeLinkData(logObject.linkData, area),
    };

    normalizedLog.actions.forEach((action) => {
      if (action.spellIndex >= 0) {
        action.spell = normalizedLog.spells[action.spellIndex];
      }
    });

    return normalizedLog;
  };

  public buildReplayCode = (logObject: GameLogData): string => {
    const normalizedLog = this.normalizeGameLog(logObject);
    // 保留 scoreNow / cell_after 等快照字段，回放与分析都依赖它们
    const replayLog = { ...normalizedLog };
    const dataToEncode: ReplayPayload = {
      version: REPLAY_DATA_VERSION,
      data: replayLog,
    };
    const originalLogString = JSON.stringify(dataToEncode);
    const compressedData = pako.deflate(originalLogString);
    return this.uint8ArrayToBase64(compressedData);
  };

  public sanitizeFileName = (value: string): string => {
    const sanitized = value.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim();
    return sanitized || "unknown";
  };

  public buildReadableLogFileName = (logData: GameLogData, prefix = "BingoLog"): string => {
    const date = new Date(logData.gameStartTimestamp || Date.now());
    const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date
      .getDate()
      .toString()
      .padStart(2, "0")}`;
    const timeStr = `${date.getHours().toString().padStart(2, "0")}${date.getMinutes().toString().padStart(2, "0")}`;
    const teams = logData.standard_data?.teams;
    const leftName = teams?.[0]?.captain || teams?.[0]?.members?.[0]?.name || logData.players[0] || "playerA";
    const rightName = teams?.[1]?.captain || teams?.[1]?.members?.[0]?.name || logData.players[1] || "playerB";
    const leftPlayer = this.sanitizeFileName(leftName);
    const rightPlayer = this.sanitizeFileName(rightName);
    return `${prefix}_${dateStr}_${timeStr}_${leftPlayer}_vs_${rightPlayer}.txt`;
  };

  public buildReadableLogContent = (logObject: GameLogData): ReadableLogBuildResult => {
    const normalizedLog = this.normalizeGameLog(logObject);
    const replayCode = this.buildReplayCode(normalizedLog);
    return {
      content: this.formatLogForDownload(normalizedLog, replayCode),
      logData: normalizedLog,
      replayCode,
      fileName: this.buildReadableLogFileName(normalizedLog),
    };
  };

  public buildReadablePreviewContent = (logObject: GameLogData): ReadableLogBuildResult => {
    const result = this.buildReadableLogContent(logObject);
    const marker = "\n\n--- DO NOT EDIT BELOW THIS LINE ---";
    const markerIndex = result.content.indexOf(marker);
    return {
      ...result,
      content: markerIndex >= 0 ? result.content.slice(0, markerIndex).trimEnd() : result.content,
    };
  };

  public getSetStatusLabel = (status: number): string => {
    if (status === SpellStatus.NONE) return "重置状态";
    if (status === SpellStatus.A_SELECTED) return "左侧选择";
    if (status === SpellStatus.B_SELECTED) return "右侧选择";
    if (status === SpellStatus.BOTH_SELECTED) return "双方选择";
    if (status === SpellStatus.A_ATTAINED) return "左侧收取";
    if (status === SpellStatus.B_ATTAINED) return "右侧收取";
    if (status === SpellStatus.BOTH_ATTAINED) return "双方收取";
    if (status === SpellStatus.BANNED) return "禁用符卡";
    if (status === SpellStatus.BOTH_HIDDEN) return "双方隐藏";
    if (status === SpellStatus.ONLY_REVEAL_GAME) return "仅显示游戏";
    if (status === SpellStatus.ONLY_REVEAL_GAME_STAGE) return "仅显示来源";
    if (status === SpellStatus.ONLY_REVEAL_STAR) return "仅显示星级";
    return `设置状态 ${status}`;
  };

  public getActionTypeLabel = (actionType: string): string => {
    if (actionType === "select") return "选择符卡";
    if (actionType === "finish") return "收取符卡";
    if (actionType === "contest_win") return "抢卡成功";
    if (actionType === "pause") return "暂停比赛";
    if (actionType === "resume") return "恢复比赛";
    if (actionType.startsWith("set-")) {
      return this.getSetStatusLabel(parseInt(actionType.split("-")[1], 10));
    }
    return actionType;
  };

  public downloadReadableLog = (logObject: GameLogData) => {
    const result = this.buildReadableLogContent(logObject);
    this.triggerDownload(result.content, result.fileName);
  };

  private formatLinkReadableLogForDownload = (
    logData: GameLogData,
    replayDataB64: string,
    helpers: {
      formatTimestamp: (ms: number) => string;
      padStart: (str: string, targetLength: number, padString?: string) => string;
      formatBoard: (boardSpells: Spell[], portals: number[] | undefined, title: string) => void;
    },
    _baseOutput: string[]
  ): string => {
    const { roomConfig, players, spells, actions } = logData;
    const { formatTimestamp, formatBoard } = helpers;
    const output: string[] = [];
    const bs = roomConfig.board_size || 5;
    const area = bs * bs;
    const finalLinkData =
      actions
        .slice()
        .reverse()
        .find((action) => action.linkData)?.linkData ||
      logData.linkData ||
      null;
    const routeActions = new Set(["link_route", "link_undo", "link_confirm_route", "link_unconfirm_route"]);
    const scoreLabel = (data: LinkData | null | undefined) =>
      data ? `${(data.score_a || 0).toFixed(2)} - ${(data.score_b || 0).toFixed(2)}` : "0.00 - 0.00";
    const cellLabel = (idx: number) => `(${Math.floor(idx / bs) + 1}, ${(idx % bs) + 1})`;
    const routeLabel = (route: number[] | undefined) => (route || []).map(cellLabel).join(" -> ") || "-";
    const collectStats = players.map((player) => {
      const stats = {
        selectActionByIndex: new Map<number, PlayerAction>(),
        completedTasks: [] as string[],
        skippedTasks: [] as string[],
        totalTime: 0,
        starCounts: [0, 0, 0, 0, 0],
      };
      actions.forEach((action) => {
        if (action.playerName !== player || action.spellIndex < 0) return;
        // if (action.playerName !== players[0] && action.playerName !== players[1]) return;
        if (action.actionType === "link_start_run" || action.actionType === "link_next_card") {
          stats.selectActionByIndex.set(action.spellIndex, action);
          return;
        }
        if (action.actionType === "link_skip_card") {
          const spell = spells[action.spellIndex];
          stats.selectActionByIndex.delete(action.spellIndex);
          stats.skippedTasks.push(`- "${spell?.name || action.spellName}" (跳过)`);
          return;
        }
        if (action.actionType !== "link_finish_card") return;
        const spell = spells[action.spellIndex];
        if (!spell) return;
        const selectAction = stats.selectActionByIndex.get(action.spellIndex);
        stats.selectActionByIndex.delete(action.spellIndex);
        const duration = selectAction ? Math.max(0, action.timestamp - selectAction.timestamp) : 0;
        stats.totalTime += duration;
        stats.starCounts[spell.star - 1] = (stats.starCounts[spell.star - 1] || 0) + 1;
        stats.completedTasks.push(`- "${spell.name}": ${(duration / 1000).toFixed(2)}s`);
      });
      return stats;
    });

    output.push(`东方Bingo Link赛日志`);
    output.push(`对局开始时间: ${new Date(logData.gameStartTimestamp).toLocaleString()}`);
    output.push(`玩家: ${players[0]} vs ${players[1]}`);
    output.push(`最终分数: ${scoreLabel(finalLinkData)}`);
    output.push("---");
    output.push("【游戏设置】");
    output.push(`模式: ${Config.gameTypeList.find((g) => g.type === roomConfig.type)?.name || "Link赛"}`);
    output.push(`盘面尺寸: ${bs}x${bs}`);
    output.push(`CD: ${roomConfig.cd_time}秒, 连接规则: ${roomConfig.link_connectivity === 4 ? "四向" : "八向"}`);
    output.push(`计分系数: 等级 ${roomConfig.link_level_coefficient ?? 0}, 最速 ${roomConfig.link_fastest_coefficient ?? 0}`);
    if (roomConfig.use_ai) {
      output.push(`AI练习: 开启`);
    }
    output.push(`A路线端点: ${cellLabel(roomConfig.link_start_a ?? 0)} -> ${cellLabel(roomConfig.link_end_a ?? area - 1)}`);
    output.push(`B路线端点: ${cellLabel(roomConfig.link_start_b ?? bs - 1)} -> ${cellLabel(roomConfig.link_end_b ?? area - bs)}`);
    if (roomConfig.link_disabled_idx?.length) {
      output.push(`禁用格: ${roomConfig.link_disabled_idx.map(cellLabel).join(", ")}`);
    }
    output.push("---");
    formatBoard(spells, undefined, "【盘面】");
    output.push("");
    output.push("【路线】");
    output.push(`${players[0]}: ${routeLabel(finalLinkData?.link_idx_a)}`);
    output.push(`${players[1]}: ${routeLabel(finalLinkData?.link_idx_b)}`);
    output.push("---");
    output.push("【游戏进程】");

    actions
      .filter((action) => !routeActions.has(action.actionType))
      .forEach((action) => {
        const timeStr = `[${formatTimestamp(action.timestamp)}]`;
        const spellText = action.spellIndex >= 0 ? `${cellLabel(action.spellIndex)} "${action.spellName}"` : "";
        let line = `${timeStr} `;
        switch (action.actionType) {
          case "link_start_run":
            line += `${action.playerName} 开始竞速。`;
            break;
          case "link_next_card":
            line += `${action.playerName} 选择 ${spellText}。`;
            break;
          case "link_finish_card":
            line += `${action.playerName} 收取 ${spellText}。`;
            break;
          case "link_skip_card":
            line += `${action.playerName} 跳过 ${spellText}。`;
            break;
          case "link_undo_finish":
            line += `${action.playerName} 撤销收取 ${spellText}。`;
            break;
          case "link_set_skip_used":
            line += `${action.playerName} 调整跳过次数。`;
            break;
          case "link_finish_run":
            line += `${action.playerName} 结束竞速。`;
            break;
          case "link_ai_speedrun":
            line += `${action.playerName} 使用AI速通模式完成路线，已按真实触发时间还原耗时。`;
            break;
          default:
            line += `${action.playerName || "-"} ${this.getActionTypeLabel(action.actionType)} ${spellText}`;
            break;
        }
        output.push(line);
      });

    output.push("---");
    output.push("【数据分析】");
    players.forEach((player, playerIndex) => {
      const route = playerIndex === 0 ? finalLinkData?.link_idx_a || [] : finalLinkData?.link_idx_b || [];
      const skipped = new Set(playerIndex === 0 ? finalLinkData?.skipped_idx_a || [] : finalLinkData?.skipped_idx_b || []);
      const currentStep = playerIndex === 0 ? finalLinkData?.current_step_a || 0 : finalLinkData?.current_step_b || 0;
      const completedRoute = route.slice(0, currentStep);
      const capturedRoute = completedRoute.filter((idx) => !skipped.has(idx));
      let levelSum = 0;
      capturedRoute.forEach((idx) => {
        const spell = spells[idx];
        if (!spell) return;
        levelSum += spell.star || 0;
      });
      const scoreValue = playerIndex === 0 ? finalLinkData?.score_a || 0 : finalLinkData?.score_b || 0;
      const stats = collectStats[playerIndex];
      output.push(`[玩家: ${player}]`);
      output.push(...stats.completedTasks);
      output.push(...stats.skippedTasks);
      output.push(`完成进度: ${completedRoute.length}/${route.length}, 收取 ${capturedRoute.length} 张, 跳过 ${skipped.size} 张`);
      output.push(`等级分布: [${stats.starCounts.join(",")}], 总等级: ${levelSum}`);
      output.push(`收卡时间: ${formatTimestamp(stats.totalTime)} (${(stats.totalTime / 1000).toFixed(2)}s)`);
      output.push(`Link分数: ${scoreValue.toFixed(2)}`);
      output.push("");
    });

    const formattedReplayData = this.formatStringWithLineBreaks(replayDataB64, 128);
    output.push("\n\n--- DO NOT EDIT BELOW THIS LINE ---");
    output.push("本局回放代码：\n");
    output.push(formattedReplayData);
    return output.join("\n");
  };

  public fetchAndProcessGameLog = async () => {
    try {
      const logObject: GameLogData = await ws.send(WebSocketActionType.PRINT_LOG);

      if (typeof logObject !== "object" || logObject === null) {
        throw new Error("收到的日志格式不正确，期望是一个对象");
      }

      // 将spells对象附加到actions上，方便后续处理
      logObject.actions.forEach((action) => {
        if (action.spellIndex >= 0) {
          action.spell = logObject.spells[action.spellIndex];
        }
      });

      const result = this.buildReadableLogContent(logObject);
      this.triggerDownload(result.content, result.fileName);
    } catch (error) {
      console.error("获取或处理游戏日志失败:", error);
      throw error;
    }
  };

  public triggerDownload = (content: BlobPart, fileName: string, mimeType = "text/plain;charset=utf-8") => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    //文件命名加入时分信息
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * 多人标准赛导出日志：口径见设计文档 10.4.1。
   * 状态一律由 action.cell_after 快照驱动，不再用 actionType 差分推断。
   */
  public formatStandardReadableLog = (logData: GameLogData, replayDataB64: string): string => {
    const { roomConfig, players, score, spells, spells2, actions, gameStartTimestamp } = logData;
    const standard = logData.standard_data!;
    const bs = roomConfig.board_size || 5;
    const area = bs * bs;
    const isDual = !!standard.dual_board;
    const countdownMs = roomConfig.countdown * 1000;
    const teamOf: Record<string, number> = {};
    (standard.teams || []).forEach((team, index) => {
      (team.members || []).forEach((m) => {
        teamOf[m.name] = index;
      });
    });
    const allPlayers = (standard.teams || []).flatMap((t) => (t.members || []).map((m) => m.name));
    if (!allPlayers.length) allPlayers.push(...players);

    const output: string[] = [];
    const formatTimestamp = (ms: number) => {
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60)
        .toString()
        .padStart(2, "0");
      const seconds = (totalSeconds % 60).toString().padStart(2, "0");
      return `${minutes}:${seconds}`;
    };
    const getVisualLength = (str: string): number => {
      const wideCharRegex = /[一-龥＀-￯]/g;
      return str.replace(wideCharRegex, "  ").length;
    };
    const padStart = (str: string, targetLength: number, padString = " "): string => {
      const paddingLength = targetLength - getVisualLength(str);
      return paddingLength <= 0 ? str : padString.repeat(paddingLength) + str;
    };
    const padEnd = (str: string, targetLength: number, padString = " "): string => {
      const paddingLength = targetLength - getVisualLength(str);
      return paddingLength <= 0 ? str : str + padString.repeat(paddingLength);
    };
    const cellLabel = (index: number) => `(${Math.floor(index / bs) + 1}, ${(index % bs) + 1})`;
    const spellAt = (board: number, index: number) =>
      (board === 1 ? spells2 : spells)?.[index] || spells?.[index];
    const starOf = (board: number, index: number) => {
      if (!isDual) return spells?.[index]?.star || 0;
      return Math.max(spells?.[index]?.star || 0, spells2?.[index]?.star || 0);
    };

    // ---------- 暂停区间 ----------
    const pauseIntervals: [number, number][] = [];
    let pauseStart = -1;
    for (const action of actions) {
      const op = action.op || action.actionType;
      if (op === "pause") pauseStart = action.timestamp;
      else if (op === "resume" && pauseStart >= 0) {
        pauseIntervals.push([pauseStart, action.timestamp]);
        pauseStart = -1;
      }
    }
    const pauseBefore = (ts: number) =>
      pauseIntervals.reduce((sum, [start, end]) => sum + Math.max(0, Math.min(ts, end) - start), 0);
    const gameTs = (ts: number) => ts - pauseBefore(ts);
    const duration = (startTs: number, endTs: number) =>
      Math.max(0, gameTs(endTs) - Math.max(gameTs(startTs), countdownMs));

    type Cycle = { board: number; index: number; startTs: number };
    type PlayerStats = {
      name: string;
      active: Cycle | null;
      captureActions: number;
      untrackedCaptures: number;
      stolenCount: number;
      teammateStolenCount: number;
      changeCount: number;
      directorAttributed: number;
      tasks: string[];
      stars: number[];
    };
    const stats: Record<string, PlayerStats> = {};
    allPlayers.forEach((name) => {
      stats[name] = {
        name,
        active: null,
        captureActions: 0,
        untrackedCaptures: 0,
        stolenCount: 0,
        teammateStolenCount: 0,
        changeCount: 0,
        directorAttributed: 0,
        tasks: [],
        stars: [0, 0, 0, 0, 0],
      };
    });

    const addCaptureStats = (st: PlayerStats, board: number, index: number, d: number) => {
      const spell = spellAt(board, index);
      st.captureActions++;
      const star = spell?.star || 1;
      if (star >= 1 && star <= 5) st.stars[star - 1]++;
      st.tasks.push(`- "${spell?.name || "?"}": ${(d / 1000).toFixed(2)}s`);
    };
    const closeActive = (st: PlayerStats, kind: "abandoned" | "stolen", endTs: number, note?: string) => {
      if (!st.active) return;
      if (kind === "stolen") {
        const d = duration(st.active.startTs, endTs);
        st.stolenCount++;
        if (note === "teammate") st.teammateStolenCount++;
        const spell = spellAt(st.active.board, st.active.index);
        st.tasks.push(`- "${spell?.name || "?"}" (被抢${note === "teammate" ? "，队友完成" : ""}): ${(d / 1000).toFixed(2)}s`);
      }
      st.active = null;
    };

    // ---------- 队伍统计 ----------
    const fullyState: (number | null)[] = new Array(area).fill(null);
    const captureBoardOf = (a: PlayerAction) => a.board ?? 0;

    for (const action of actions) {
      const op = action.op || action.actionType;
      const index = action.spellIndex;
      const board = captureBoardOf(action);
      if (action.cell_after && index >= 0) {
        fullyState[index] = action.cell_after.fully_captured_by ?? null;
      }

      if (op === "select" || op === "director_select") {
        const name = op === "director_select" ? action.name ?? action.affected_name : action.playerName;
        const st = name ? stats[name] : null;
        if (st) {
          closeActive(st, "abandoned", action.timestamp);
          st.active = { board, index, startTs: action.timestamp };
        }
        continue;
      }
      if (op === "cancel" || op === "director_cancel") {
        const name = op === "director_cancel" ? action.name ?? action.affected_name : action.playerName;
        const st = name ? stats[name] : null;
        if (st) closeActive(st, "abandoned", action.timestamp);
        continue;
      }
      if (op === "change") {
        const st = stats[action.playerName];
        if (st) {
          closeActive(st, "abandoned", action.timestamp);
          st.changeCount++;
        }
        continue;
      }
      if (op === "capture_partial" || op === "capture_complete" || action.actionType === "finish" || action.actionType === "contest_win") {
        const st = stats[action.playerName];
        if (!st) continue;
        if (st.active && st.active.index === index && st.active.board === board) {
          addCaptureStats(st, board, index, duration(st.active.startTs, action.timestamp));
          st.active = null;
        } else {
          if (st.active) closeActive(st, "abandoned", action.timestamp);
          st.untrackedCaptures++;
        }
        // 受害者（抢夺/队友完成）
        for (const victim of action.victims || []) {
          if (victim === action.playerName) continue;
          const victimStats = stats[victim];
          if (!victimStats?.active) continue;
          if (victimStats.active.index !== index) continue;
          const sameTeam = teamOf[victim] === teamOf[action.playerName];
          closeActive(victimStats, "stolen", action.timestamp, sameTeam ? "teammate" : undefined);
        }
        continue;
      }
      if (op === "director_capture" || op === "director_set") {
        const team = action.team ?? 0;
        // 归给该队最后仍选择该格的玩家
        let attributed: PlayerStats | null = null;
        for (const name of allPlayers) {
          if (teamOf[name] !== team) continue;
          const st = stats[name];
          if (st.active && st.active.index === index) {
            if (!attributed || st.active.startTs > attributed.active!.startTs) attributed = st;
          }
        }
        if (attributed) {
          addCaptureStats(attributed, attributed.active!.board, index, duration(attributed.active!.startTs, action.timestamp));
          attributed.directorAttributed++;
          attributed.active = null;
        }
        for (const victim of action.victims || []) {
          if (attributed && victim === attributed.name) continue;
          const victimStats = stats[victim];
          if (!victimStats?.active || victimStats.active.index !== index) continue;
          const sameTeam = teamOf[victim] === team;
          closeActive(victimStats, "stolen", action.timestamp, sameTeam ? "teammate" : undefined);
        }
        continue;
      }
      if (op === "director_clear") {
        for (const name of allPlayers) {
          const st = stats[name];
          if (st.active && st.active.index === index) closeActive(st, "abandoned", action.timestamp);
        }
        continue;
      }
      if (op === "capture_partial" || op === "capture_complete") continue;
    }

    // ---------- 输出：基础信息 ----------
    const teamLine = (team: any, index: number) =>
      `${index === 0 ? "A" : "B"}队: ${(team?.members || []).map((m: any) => (m.captain ? `${m.name}(队长)` : m.name)).join(", ") || "-"}`;
    output.push("东方Bingo对战日志");
    output.push(`对局开始时间: ${new Date(gameStartTimestamp).toLocaleString()}`);
    output.push(teamLine(standard.teams?.[0], 0));
    output.push(teamLine(standard.teams?.[1], 1));
    output.push(`最终比分: ${score[0]} - ${score[1]}`);
    output.push("---");
    output.push("【游戏设置】");
    output.push(`模式: 标准赛`);
    output.push(`盘面尺寸: ${bs}x${bs}`);
    output.push(`收卡标准: ${isDual ? "双盘（每面 1 次）" : standard.capture_standard}`);
    if (standard.extra_lines?.length) output.push(`额外连线: ${standard.extra_lines.length}条`);
    output.push(`时长: ${roomConfig.game_time}分钟, 倒计时: ${roomConfig.countdown}秒, cd： ${roomConfig.cd_time}秒`);
    output.push(`卡池：${logData.isCustomGame ? "自定义" : Config.spellVersionList.find((n) => n.type === roomConfig.spell_version)?.name || "未知"}`);
    if (!logData.isCustomGame) {
      const gameNames = (roomConfig.games || [])
        .slice()
        .sort()
        .map((code) => Config.gameOptionList(roomConfig.spell_version).find((g) => g.code === code)?.name)
        .filter(Boolean)
        .join(", ");
      output.push(`作品来源: ${gameNames || "未指定"}`);
      output.push(`符卡难度: ${(roomConfig.ranks || []).join(", ") || "未指定"}`);
      output.push(`盘面难度: ${Config.difficultyList.find((d) => d.value === roomConfig.difficulty)?.name || "未知"}`);
      if ((roomConfig.blind_setting || 1) > 1) {
        output.push(`盲盒设定: 模式${roomConfig.blind_setting - 1}, 揭示等级${roomConfig.blind_reveal_level}`);
      }
      if (isDual) {
        output.push(
          `双重盘面: ${standard.copy_board ? "复制盘面" : `差异盘面 (差异等级: ${roomConfig.diff_level})`}`
        );
      }
    }
    output.push("---");

    // ---------- 输出：盘面 ----------
    const formatBoard = (boardSpells: Spell[], title: string) => {
      output.push(title);
      const CELL_WIDTH = 36;
      for (let i = 0; i < bs; i++) {
        let row = padStart(`${i + 1} | `, 5);
        for (let j = 0; j < bs; j++) {
          const index = i * bs + j;
          const spell = boardSpells[index];
          if (!spell) continue;
          row += padStart(`${spell.name.trim()} | `, CELL_WIDTH);
        }
        output.push(row);
      }
      output.push("【等级分布】");
      for (let i = 0; i < bs; i++) {
        let row = padStart(`${i + 1} | `, 5);
        for (let j = 0; j < bs; j++) {
          const index = i * bs + j;
          const spell = boardSpells[index];
          if (!spell) continue;
          row += padStart(`${spell.star}`, 10);
        }
        output.push(row);
      }
    };
    formatBoard(spells, isDual ? "【盘面A】" : "【盘面】");
    if (isDual && spells2) {
      output.push("");
      formatBoard(spells2, "【盘面B】");
    }
    if (standard.extra_lines?.length) {
      output.push("");
      output.push("【额外连线】");
      standard.extra_lines.forEach((line, index) => {
        output.push(`${index + 1}. ${line.map((cell) => cellLabel(cell)).join(" -> ")}`);
      });
    }
    output.push("---");

    // ---------- 输出：游戏进程 ----------
    const opLabel = (op: string) => {
      switch (op) {
        case "select": return "选择符卡";
        case "cancel": return "取消选择";
        case "capture_partial": return "收取一次";
        case "capture_complete": return "完成收取";
        case "grab_victim": return "被抢卡";
        case "grab_public": return "抢卡";
        case "director_select": return "导播选卡";
        case "director_cancel": return "导播取消";
        case "director_capture": return "导播收取一次";
        case "director_set": return "导播设为收取";
        case "director_clear": return "导播置空";
        case "change": return "使用换卡";
        case "refund": return "换卡返还";
        case "pause": return "暂停比赛";
        case "resume": return "恢复比赛";
        default: return op;
      }
    };
    output.push("【游戏进程】");
    for (const action of actions) {
      const op = action.op || action.actionType;
      const index = action.spellIndex;
      const board = captureBoardOf(action);
      const affected = action.name ?? action.affected_name;
      const who = affected ? `${action.playerName || "导播"} → ${affected}` : action.playerName || "导播";
      const boardInfo = isDual && index >= 0 ? `[盘面${board === 1 ? "B" : "A"}] ` : "";
      const location = index >= 0 ? `${boardInfo}${cellLabel(index)} ` : "";
      const card = action.spellName ? `"${action.spellName}" ` : "";
      const scoreNow = action.scoreNow ? `(比分：${action.scoreNow[0]}-${action.scoreNow[1]})` : "";
      output.push(`${formatTimestamp(action.timestamp)} | ${who} ${opLabel(op)} ${location}${card}${scoreNow}`.trim());
    }
    output.push("---");

    // ---------- 输出：玩家分析 ----------
    output.push("【数据分析】");
    for (const name of allPlayers) {
      const st = stats[name];
      const team = teamOf[name];
      output.push(`[玩家: ${name}]（${team === 0 ? "A" : "B"}队）`);
      output.push(...st.tasks);
      if (st.untrackedCaptures > 0) {
        output.push(`(有 ${st.untrackedCaptures} 次收取因无匹配选卡，未计入收卡记录)`);
      }
      if (st.stolenCount > 0) {
        output.push(`(被抢 ${st.stolenCount} 次，其中队友完成 ${st.teammateStolenCount} 次)`);
      }
      if (st.changeCount > 0) {
        output.push(`(使用换卡 ${st.changeCount} 次)`);
      }
      if (st.directorAttributed > 0) {
        output.push(`(导播代收计入 ${st.directorAttributed} 次)`);
      }
      const totalStars = st.stars.reduce((sum, value, index) => sum + value * (index + 1), 0);
      output.push(
        `总计收取 ${st.captureActions} 张，等级分布: [${st.stars.join(",")}]，总等级：${totalStars}`
      );
      output.push("");
    }

    // ---------- 输出：队伍 ----------
    for (const team of [0, 1]) {
      let capturedCells = 0;
      let totalStars = 0;
      for (let index = 0; index < area; index++) {
        if (fullyState[index] === team) {
          capturedCells++;
          totalStars += starOf(0, index);
        }
      }
      output.push(
        `[队伍 ${team === 0 ? "A" : "B"}] 得分 ${score[team] || 0}，收取格数 ${capturedCells}，总星级 ${totalStars}（双盘完整收取取两面较高星级）`
      );
      output.push("");
    }

    const formattedReplayData = this.formatStringWithLineBreaks(replayDataB64, 128);
    output.push("\n\n--- DO NOT EDIT BELOW THIS LINE ---");
    output.push("本局回放代码：\n");
    output.push(formattedReplayData);
    return output.join("\n");
  };

  public formatLogForDownload = (logData: GameLogData, replayDataB64: string): string => {
    logData = this.normalizeGameLog(logData);
    // 多人标准赛使用新的快照驱动分析
    if (logData.standard_data) {
      return this.formatStandardReadableLog(logData, replayDataB64);
    }
    const { roomConfig, players, score, spells, spells2, actions, gameStartTimestamp, normalData } = logData;
    const output: string[] = [];
    // 辅助函数
    const formatTimestamp = (ms: number) => {
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60)
        .toString()
        .padStart(2, "0");
      const seconds = (totalSeconds % 60).toString().padStart(2, "0");
      return `${minutes}:${seconds}`;
    };

    // 计算字符串的视觉宽度（中文字符算2个宽度）
    const getVisualLength = (str: string): number => {
      const wideCharRegex = /[\u4e00-\u9fa5\uff00-\uffef]/g;
      return str.replace(wideCharRegex, "  ").length;
    };

    // 在字符串前面填充，实现右对齐（尾部对齐）
    const padStart = (str: string, targetLength: number, padString = " "): string => {
      const visualLength = getVisualLength(str);
      const paddingLength = targetLength - visualLength;
      if (paddingLength <= 0) {
        return str;
      }
      return padString.repeat(paddingLength) + str;
    };

    // 在字符串后面填充，实现左对齐
    const padEnd = (str: string, targetLength: number, padString = " "): string => {
      const visualLength = getVisualLength(str);
      const paddingLength = targetLength - visualLength;
      if (paddingLength <= 0) {
        return str;
      }
      return str + padString.repeat(paddingLength);
    };

    const isCustomGame = logData.isCustomGame || false;
    const formatScoreNow = (action: PlayerAction): string => {
      const scoreNow = this.fitArray(action.scoreNow, 2, 0);
      return `${scoreNow[0]}-${scoreNow[1]}`;
    };

    // 1. 基础信息
    output.push(`东方Bingo对战日志`);
    output.push(`对局开始时间: ${new Date(gameStartTimestamp).toLocaleString()}`);
    output.push(`玩家: ${players[0]} vs ${players[1]}`);
    output.push(`最终比分: ${score[0]} - ${score[1]}`);
    output.push("---");

    // 2. 游戏设置
    output.push("【游戏设置】");
    output.push(`模式: ${Config.gameTypeList.find((g) => g.type === roomConfig.type)?.name || "未知"}`);
    output.push(`盘面尺寸: ${roomConfig.board_size}x${roomConfig.board_size}`);
    if ((roomConfig.extra_line_count || 0) > 0 || (normalData?.extra_lines?.length || 0) > 0) {
      const extraLineCount = normalData?.extra_lines?.length || roomConfig.extra_line_count || 0;
      output.push(`额外连线: ${extraLineCount}条`);
    }

    // 显示CD信息，如果有修正值则显示实际CD
    let cdInfo = `时长: ${roomConfig.game_time}分钟, 倒计时: ${roomConfig.countdown}秒, cd： ${roomConfig.cd_time}秒`;
    if (
      (roomConfig.cd_modifier_a !== undefined && roomConfig.cd_modifier_a !== 0) ||
      (roomConfig.cd_modifier_b !== undefined && roomConfig.cd_modifier_b !== 0)
    ) {
      const actualA = Math.max(
        1,
        Math.min(roomConfig.cd_time + (roomConfig.cd_modifier_a || 0), roomConfig.cd_time * 3)
      );
      const actualB = Math.max(
        1,
        Math.min(roomConfig.cd_time + (roomConfig.cd_modifier_b || 0), roomConfig.cd_time * 3)
      );
      cdInfo += ` (左侧: ${actualA}秒, 右侧: ${actualB}秒)`;
    }
    output.push(cdInfo);
    // 1. 添加符卡来源与游戏难度
    if (isCustomGame) {
      output.push(`卡池：自定义`);
    } else {
      output.push(`卡池：${Config.spellVersionList.find((n) => n.type === roomConfig.spell_version)?.name}`);
      const gameNames = roomConfig.games
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .map(
          (code) => Config.gameOptionList(this.roomStore.roomConfig.spell_version).find((g) => g.code === code)?.name
        )
        .filter(Boolean)
        .join(", ");
      output.push(`作品来源: ${gameNames || "未指定"}`);
      output.push(`符卡难度: ${roomConfig.ranks.join(", ") || "未指定"}`);
      const difficultyName = Config.difficultyList.find((d) => d.value === roomConfig.difficulty)?.name;
      output.push(`盘面难度: ${difficultyName || "未知"}`);
      let gw = "";
      for (const [gameCode, weight] of Object.entries(roomConfig.game_weight)) {
        if (weight != 0) {
          const gameName =
            gameCode === "weight_balancer"
              ? "生成波动"
              : Config.gameOptionList(this.roomStore.roomConfig.spell_version).find((g) => g.code === gameCode)?.name ||
                "";
          if (gameName === "") {
            continue;
          }
          gw += `${gameName}：${weight}；`;
        }
      }
      if (gw != "") {
        output.push(`游戏生成权重设定：${gw}`);
      }
      if (roomConfig.blind_setting > 1) {
        output.push(`盲盒设定: 模式${roomConfig.blind_setting - 1}, 揭示等级${roomConfig.blind_reveal_level}`);
      }
      if (roomConfig.dual_board > 0) {
        output.push(
          `双重盘面: ${
            roomConfig.dual_board > 0
              ? `开启 (转换格: ${roomConfig.portal_count}, 差异等级: ${roomConfig.diff_level})`
              : "关闭"
          }`
        );
      }
      if (roomConfig.use_ai) {
        output.push(
          `AI参数：Lv.${roomConfig.ai_base_power} / Lv.${roomConfig.ai_experience} 策略等级：${roomConfig.ai_strategy_level} 选卡温度：${roomConfig.ai_temperature}`
        );
        let ai_pref = "";
        for (const [gameCode, pref] of Object.entries(roomConfig.ai_preference || {})) {
          if (pref != 0) {
            const gameName =
              Config.gameOptionList(this.roomStore.roomConfig.spell_version).find((g) => g.code === gameCode)?.name ||
              "";
            if (gameName === "") {
              continue;
            }
            ai_pref += `${gameName}：${pref}；`;
          }
        }
        if (ai_pref != "") {
          output.push(`AI作品相性：${ai_pref}`);
        }
      }
    }

    output.push("---");

    // 3. 盘面符卡
    const formatBoard = (boardSpells: Spell[], portals: number[] | undefined, title: string) => {
      output.push(title);
      const bs = roomConfig.board_size || 5;
      const CELL_WIDTH = 36;
      for (let i = 0; i < bs; i++) {
        let row = padStart(`${i + 1} | `, 5);
        for (let j = 0; j < bs; j++) {
          const index = i * bs + j;
          const spell = boardSpells[index];
          if (!spell) continue;
          const isPortal = portals && portals[index] === 1 ? " (P)" : "";
          const cellContent = `${spell.name.trim()}${isPortal} | `;
          row += padStart(cellContent, CELL_WIDTH);
        }
        output.push(row);
      }

      output.push("【等级分布】");
      for (let i = 0; i < bs; i++) {
        let row = padStart(`${i + 1} | `, 5);
        for (let j = 0; j < bs; j++) {
          const index = i * bs + j;
          const spell = boardSpells[index];
          if (!spell) continue;
          const isPortal = portals && portals[index] === 1 ? "(P)" : "";
          const cellContent = `${spell.star}${isPortal}`;
          row += padStart(cellContent, 10);
        }
        output.push(row);
      }
    };
    formatBoard(spells, normalData?.is_portal_a, "【盘面A】");
    if (roomConfig.dual_board > 0 && spells2) {
      output.push("");
      formatBoard(spells2, normalData?.is_portal_b, "【盘面B】");
    }
    if (normalData?.extra_lines?.length) {
      const bs = roomConfig.board_size || 5;
      output.push("");
      output.push("【额外连线】");
      normalData.extra_lines.forEach((line, index) => {
        const cells = line
          .map((cell) => `(${Math.floor(cell / bs) + 1}, ${(cell % bs) + 1})`)
          .join(" -> ");
        output.push(`${index + 1}. ${cells}`);
      });
    }
    output.push("---");

    // 4. 游戏进程
    output.push("【游戏进程】");
    if (roomConfig.type === BingoType.LINK) {
      output.pop();
      return this.formatLinkReadableLogForDownload(
        logData,
        replayDataB64,
        { formatTimestamp, padStart, formatBoard },
        output
      );
    }

    const playerBoards: { [key: string]: number } = { [players[0]]: 0, [players[1]]: 0 };
    // 预处理，为每个玩家的 select 动作找到对应的 finish
    const playerSelectHistory: { [key: string]: PlayerAction[] } = { [players[0]]: [], [players[1]]: [] };
    const getSelectHistory = (playerName: string): PlayerAction[] => {
      if (!playerSelectHistory[playerName]) {
        playerSelectHistory[playerName] = [];
      }
      return playerSelectHistory[playerName];
    };

    actions.forEach((action) => {
      // 4. 时间格式化 & 添加行列信息
      const timeStr = `[${formatTimestamp(action.timestamp)}]`;
      let logLine = `${timeStr} `;
      const boardInfo = roomConfig.dual_board > 0 ? `(盘面${playerBoards[action.playerName] === 0 ? "A" : "B"}) ` : "";
      const bs = roomConfig.board_size || 5;
      const spellLocation =
        action.spellIndex >= 0 ? `(${Math.floor(action.spellIndex / bs) + 1}, ${(action.spellIndex % bs) + 1}) ` : "";

      if (action.actionType === "pause") {
        logLine += `${action.playerName} 暂停了游戏。`;
      } else if (action.actionType === "resume") {
        logLine += `${action.playerName} 恢复了游戏。`;
      } else if (action.actionType.startsWith("set-")) {
        const status_string = action.actionType.split("-")[1];
        const status = parseInt(status_string, 10);
        let status_name = "";
        if (status === SpellStatus.NONE) {
          status_name = "置空";
        } else if (status === SpellStatus.A_SELECTED) {
          status_name = "左侧玩家选择";
        } else if (status === SpellStatus.B_SELECTED) {
          status_name = "右侧玩家选择";
        } else if (status === SpellStatus.BOTH_SELECTED) {
          status_name = "双方玩家选择";
        } else if (status === SpellStatus.A_ATTAINED) {
          status_name = "左侧玩家收取";
        } else if (status === SpellStatus.B_ATTAINED) {
          status_name = "右侧玩家收取";
        } else if (status === SpellStatus.BOTH_ATTAINED) {
          status_name = "双方玩家收取";
        } else {
          status_name = "未知";
        }
        logLine += `${action.playerName} 将 "${action.spellName}" 设置为 ${status_name} 状态。当前比分：${formatScoreNow(action)}。`;
      } else {
        logLine += `玩家 ${action.playerName} ${boardInfo}`;
        switch (action.actionType) {
          case "select":
            logLine += `选择了符卡 ${spellLocation}"${action.spellName}"。`;
            getSelectHistory(action.playerName).push(action);
            break;
          case "finish":
          case "contest_win":
            const verb = action.actionType === "contest_win" ? "抢了" : "收取了";
            logLine += `${verb}符卡 ${spellLocation}"${action.spellName}"。`;

            // 4. 计算并显示用时
            const lastSelect = getSelectHistory(action.playerName).pop();
            if (lastSelect) {
              const startTime = Math.max(lastSelect.timestamp, roomConfig.countdown * 1000);
              const endTime = action.timestamp;
              let pauseDurationInInterval = 0;
              let pStart = 0;
              actions.forEach((pAction) => {
                if (pAction.timestamp > startTime && pAction.timestamp < endTime) {
                  if (pAction.actionType === "pause") pStart = pAction.timestamp;
                  if (pAction.actionType === "resume" && pStart > 0) {
                    pauseDurationInInterval += pAction.timestamp - pStart;
                    pStart = 0;
                  }
                }
              });
              const duration = endTime - startTime - pauseDurationInInterval;
              if (duration > 0) {
                logLine += ` (用时: ${(duration / 1000).toFixed(2)}s)`;
              }
              logLine += `(比分：${formatScoreNow(action)})`;
            }
            break;
        }

        // 处理双盘面翻转
        if (
          roomConfig.dual_board > 0 &&
          normalData &&
          (action.actionType === "finish" || action.actionType === "contest_win")
        ) {
          const currentBoard = playerBoards[action.playerName];
          const portals = currentBoard === 0 ? normalData.is_portal_a : normalData.is_portal_b;
          if (portals && portals[action.spellIndex] === 1) {
            playerBoards[action.playerName] = 1 - currentBoard;
            logLine += ` (切换至盘面${playerBoards[action.playerName] === 0 ? "A" : "B"})`;
          }
        }
      }
      output.push(logLine);
    });
    output.push("---");

    // 5. 评价汇总
    // 5. 评价汇总
    output.push("【数据分析】");
    const countdownMs = roomConfig.countdown * 1000;

    // New data structure for player stats
    const playerStats: { [key: string]: any } = {};
    players.forEach((player) => {
      playerStats[player] = {
        selectStack: [],
        totalTime: 0,
        totalStars: [0, 0, 0, 0, 0],
        completedTasks: [],
        stolenTasks: [], // For stolen cards
        untrackedFinishes: 0,
        stolenCount: 0,
      };
    });

    const getSpellForAction = (action: PlayerAction, isCapture: boolean = true, isOpponent: boolean = false): Spell | undefined => {
      if (!roomConfig.dual_board || !normalData || !spells2) {
        return spells[action.spellIndex];
      }

      let playerIndex = players.indexOf(action.playerName);
      if(isOpponent) playerIndex = 1 - playerIndex;

      if (isCapture) {
        // getOnWhichBoard: 0x1: Left/A, 0x2: Left/B, 0x10: Right/A, 0x20: Right/B
        const getInfo = normalData.get_on_which_board[action.spellIndex];
        const boardFlag = playerIndex === 0 ? getInfo & 0x0f : (getInfo >> 4) & 0x0f;

        if (boardFlag === 1) return spells[action.spellIndex]; // 在盘面A收取
        if (boardFlag === 2) return spells2[action.spellIndex]; // 在盘面B收取
      }

      // 如果没有收取信息（比如只是select），则根据当前玩家所在盘面判断
      const playerBoard = playerBoards[players[playerIndex]];
      return playerBoard === 0 ? spells[action.spellIndex] : spells2[action.spellIndex];
    };

    // Single pass through actions to process data for both players
    for (const action of actions) {
      const player = action.playerName;
      if (!player) continue;
      const opponent = players.find((p) => p !== player)!;
      const stats = playerStats[player];
      const opponentStats = playerStats[opponent];
      // if (!stats || !opponentStats) continue;

      const playerIndex = players.indexOf(player);

      if (action.actionType === "select") {
        stats.selectStack.push(action);
      } else if (action.actionType.startsWith("set-")) {
        const status_string = action.actionType.split("-")[1];
        const status = parseInt(status_string, 10);

        // New Rule: If this set action overwrites an opponent's selection, it's a steal.
        const opponentLastSelect = opponentStats.selectStack[opponentStats.selectStack.length - 1];
        if (opponentLastSelect && opponentLastSelect.spellIndex === action.spellIndex) {
          const isPlayerAStealing = playerIndex === 0 && status === SpellStatus.A_ATTAINED;
          const isPlayerBStealing = playerIndex === 1 && status === SpellStatus.B_ATTAINED;

          if (isPlayerAStealing || isPlayerBStealing) {
            opponentStats.selectStack.pop(); // Remove the stolen selection
            opponentStats.stolenCount++;

            const spell = getSpellForAction(action);
            if (spell) {
              const startTime = Math.max(opponentLastSelect.timestamp, countdownMs);
              const endTime = action.timestamp;
              let pauseDurationInInterval = 0;
              let pStart = 0;
              actions.forEach((pAction) => {
                if (pAction.timestamp > startTime && pAction.timestamp < endTime) {
                  if (pAction.actionType === "pause") pStart = pAction.timestamp;
                  if (pAction.actionType === "resume" && pStart > 0) {
                    pauseDurationInInterval += pAction.timestamp - pStart;
                    pStart = 0;
                  }
                }
              });
              const duration = endTime - startTime - pauseDurationInInterval;
              if (duration > 0) {
                opponentStats.stolenTasks.push(`- "${spell.name}" (被抢): ${(duration / 1000).toFixed(2)}s`);
              }
            }
          }
        }

        // 1) set-X as a selection
        const isPlayerASelect = status === SpellStatus.A_SELECTED || status === SpellStatus.BOTH_SELECTED;
        const isPlayerBSelect = status === SpellStatus.B_SELECTED || status === SpellStatus.BOTH_SELECTED;
        if (isPlayerASelect || isPlayerBSelect) {
          stats.selectStack.push(action);
        }

        // 2) set-X as a collection
        // Here, we regard opponent-set get as INVALID
        const isPlayerAAttain = playerIndex === 0 && status === SpellStatus.A_ATTAINED;
        const isPlayerBAttain = playerIndex === 1 && status === SpellStatus.B_ATTAINED;
        if (isPlayerAAttain || isPlayerBAttain) {
          const lastSelect = stats.selectStack.length > 0 ? stats.selectStack[stats.selectStack.length - 1] : undefined;
          if (lastSelect && lastSelect.spellIndex === action.spellIndex) {
            stats.selectStack.pop(); // Matched selection
            const spell = getSpellForAction(action);
            if (!spell) continue;

            const startTime = Math.max(lastSelect.timestamp, countdownMs);
            const endTime = action.timestamp;
            let pauseDurationInInterval = 0;
            let pStart = 0;
            actions.forEach((pAction) => {
              if (pAction.timestamp > startTime && pAction.timestamp < endTime) {
                if (pAction.actionType === "pause") pStart = pAction.timestamp;
                if (pAction.actionType === "resume" && pStart > 0) {
                  pauseDurationInInterval += pAction.timestamp - pStart;
                  pStart = 0;
                }
              }
            });
            const duration = endTime - startTime - pauseDurationInInterval;
            if (duration > 0) {
              stats.totalTime += duration;
              stats.totalStars[spell.star - 1] += 1;
              stats.completedTasks.push(`- "${spell.name}": ${(duration / 1000).toFixed(2)}s`);
            }
          } else {
            stats.untrackedFinishes++;
          }
        }
      } else if (action.actionType === "finish" || action.actionType === "contest_win") {
        const lastSelect = stats.selectStack.pop();
        if (lastSelect) {
          const spell = getSpellForAction(action);
          if (!spell) continue;

          const startTime = Math.max(lastSelect.timestamp, countdownMs);
          const endTime = action.timestamp;
          let pauseDurationInInterval = 0;
          let pStart = 0;
          actions.forEach((pAction) => {
            if (pAction.timestamp > startTime && pAction.timestamp < endTime) {
              if (pAction.actionType === "pause") pStart = pAction.timestamp;
              if (pAction.actionType === "resume" && pStart > 0) {
                pauseDurationInInterval += pAction.timestamp - pStart;
                pStart = 0;
              }
            }
          });
          const duration = endTime - startTime - pauseDurationInInterval;
          if (duration > 0) {
            stats.totalTime += duration;
            stats.totalStars[spell.star - 1] += 1;
            stats.completedTasks.push(`- "${spell.name}": ${(duration / 1000).toFixed(2)}s`);
          }
        } else {
          stats.untrackedFinishes++;
        }

        // 3) Contest loss for opponent
        if (action.actionType === "contest_win") {
          const opponentLastSelect = opponentStats.selectStack[opponentStats.selectStack.length - 1];
          if (opponentLastSelect && opponentLastSelect.spellIndex === action.spellIndex) {
            opponentStats.selectStack.pop();
            opponentStats.stolenCount++;

            const spell = getSpellForAction(action, false, true);
            if (!spell) continue;

            const startTime = Math.max(opponentLastSelect.timestamp, countdownMs);
            const endTime = action.timestamp;
            let pauseDurationInInterval = 0;
            let pStart = 0;
            actions.forEach((pAction) => {
              if (pAction.timestamp > startTime && pAction.timestamp < endTime) {
                if (pAction.actionType === "pause") pStart = pAction.timestamp;
                if (pAction.actionType === "resume" && pStart > 0) {
                  pauseDurationInInterval += pAction.timestamp - pStart;
                  pStart = 0;
                }
              }
            });
            const duration = endTime - startTime - pauseDurationInInterval;
            if (duration > 0) {
              opponentStats.stolenTasks.push(`- "${spell.name}" (被抢): ${(duration / 1000).toFixed(2)}s`);
            }
          }
        }
      }
    }

    // Generate output from processed stats
    players.forEach((player) => {
      output.push(`[玩家: ${player}]`);
      const stats = playerStats[player];

      output.push(...stats.completedTasks);
      output.push(...stats.stolenTasks); // Show stolen tasks in the log

      if (stats.untrackedFinishes > 0) {
        output.push(`(有 ${stats.untrackedFinishes} 次收取操作因无前置选择或不匹配，未计入收卡记录)`);
      }
      if (stats.stolenCount > 0) {
        output.push(`(有 ${stats.stolenCount} 张选择的符卡被对手抢走)`);
      }

      output.push(
        `总计收取 ${stats.completedTasks.length} 张符卡，等级分布: [${stats.totalStars.join(
          ","
        )}]，总等级：${stats.totalStars.reduce((sum, value, index) => sum + value * (index + 1), 0)}`
      );
      output.push(`总收卡时间: ${formatTimestamp(stats.totalTime)}`);
      output.push("");
    });

    const formattedReplayData = this.formatStringWithLineBreaks(replayDataB64, 128);
    output.push("\n\n--- DO NOT EDIT BELOW THIS LINE ---");
    output.push("本局回放代码：\n");
    output.push(formattedReplayData);

    return output.join("\n");
  };
}

export default new Replay();
