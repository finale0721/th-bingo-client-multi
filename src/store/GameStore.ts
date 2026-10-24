import { defineStore } from "pinia";
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useRoomStore } from "./RoomStore";
import { BingoType, CellView, GameData, GameStatus, OneSpell, RoomConfig, Spell, SpellStatus, EditorPreset, LinkData } from "@/types";
import { BoardSpec } from "@/utils/board";
import ws from "@/utils/webSocket/WebSocketBingo";
import { WebSocketActionType, WebSocketPushActionType } from "@/utils/webSocket/types";
import Config from "@/config"
import pako from 'pako';
import Replay from "@/utils/Replay";

interface GameLog {
  index: number;
  status: number;
  oldStatus: number;
  causer: string;
  failCountA?: number;
  failCountB?: number;
  getOnWhichBoard?: number;
}

export const useGameStore = defineStore("game", () => {
  const roomStore = useRoomStore();

  //bingo对局相关
  const spells = ref<Spell[]>([]);
  /** 旧状态，仅回放/编辑器使用；实时标准赛只读 cells */
  const spellStatus = ref<SpellStatus[]>([]);
  const cells = ref<CellView[]>([]);
  const cells2 = ref<CellView[]>([]);
  const mySelectedIndex = ref(-1);
  const mySelectedBoard = ref(0);
  const myTeam = ref<number | null>(null);
  const isCaptain = ref(false);
  const captureStandard = ref(1);
  const changeCardCount = ref<number[]>([0, 0]);
  const changePending = ref(false);
  const changeOriginIndex = ref(-1);
  const changeOriginBoard = ref(-1);
  const extraLines = ref<number[][]>([]);
  const leftTime = ref(0);
  const countDownTime = ref(0);
  const gameStatus = ref(GameStatus.NOT_STARTED);
  const leftCdTime = ref(-1);
  const debugSpellList = ref([]);
  const gameLogs = reactive<string[]>([]);
  const winner = ref<-1 | 0 | 1 | undefined | null>(null);
  const inited = ref(false);
  const alreadySelectCard = ref(false);
  const spells2 = ref<Spell[]>([]);
  const currentBoard = ref(0);

  const isReplayMode = ref(false);

  const spellCardGrabbedFlag = ref(false);
  let pendingSpellStatusTimers: number[] = [];
  watch(spellCardGrabbedFlag, (val) => {
    if (val) {
      nextTick(() => {
        spellCardGrabbedFlag.value = false;
      });
    }
  });

  // 兼容旧调用点：按“自己所在队伍”返回自己的选卡
  const playerASelectedIndex = computed(() => (myTeam.value === 0 ? mySelectedIndex.value : -1));
  const playerBSelectedIndex = computed(() => (myTeam.value === 1 ? mySelectedIndex.value : -1));

  const createBlankLinkData = (): LinkData => ({
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
    status_a: [],
    status_b: [],
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
  });
  const linkGameData = reactive<LinkData>(createBlankLinkData());
  let linkLogSnapshot: LinkData | null = null;
  const normalizeLinkData = (data?: Partial<LinkData> | null): LinkData => ({
    ...createBlankLinkData(),
    ...(data || {}),
    link_idx_a: [...(data?.link_idx_a || [])],
    link_idx_b: [...(data?.link_idx_b || [])],
    status_a: [...(data?.status_a || [])],
    status_b: [...(data?.status_b || [])],
    skipped_idx_a: [...(data?.skipped_idx_a || [])],
    skipped_idx_b: [...(data?.skipped_idx_b || [])],
    disabled_idx: [...(data?.disabled_idx || [])],
  });
  const cloneLinkData = (data: LinkData): LinkData => ({
    ...normalizeLinkData(data),
    link_idx_a: [...(data.link_idx_a || [])],
    link_idx_b: [...(data.link_idx_b || [])],
    status_a: [...(data.status_a || [])],
    status_b: [...(data.status_b || [])],
    skipped_idx_a: [...(data.skipped_idx_a || [])],
    skipped_idx_b: [...(data.skipped_idx_b || [])],
    disabled_idx: [...(data.disabled_idx || [])],
  });
  const applyLinkData = (data?: Partial<LinkData> | null, replace = false) => {
    if (replace) {
      Object.assign(linkGameData, normalizeLinkData(data));
      return;
    }
    if (!data) return;
    for (const key in data) {
      const value = data[key];
      linkGameData[key] = Array.isArray(value) ? [...value] : value;
    }
  };

  let gameDataLoading = false;
  let gameDataRetry = false;
  const getGameData = () => {
    // 还没进入房间时不要发请求；等 roomId 就绪后由 watch/推送触发
    if (!roomStore.roomId) return Promise.resolve();
    // 开局/重连时 push_start_game 与 push_roster_update 可能同时触发，避免重复请求
    if (gameDataLoading) {
      gameDataRetry = true;
      return Promise.resolve();
    }
    gameDataLoading = true;
    gameDataRetry = false;
    const requestRoomId = roomStore.roomId;
    return ws
      .send(WebSocketActionType.GET_ALL_SPELLS)
      .then((data: GameData) => {
        // 请求期间切换了房间：丢弃旧数据，结束后按新 roomId 重新拉取
        if (requestRoomId !== roomStore.roomId) {
          gameDataRetry = true;
          return;
        }
        if (data.room_config) roomStore.applyRoomConfig(data.room_config, true);
        spells.value = data.spells;
        spells2.value = data.spells2 || [];
        cells.value = data.cells || [];
        cells2.value = data.cells2 || [];
        mySelectedIndex.value = data.my_selected_index ?? -1;
        mySelectedBoard.value = data.my_selected_board ?? 0;
        myTeam.value = data.my_team ?? null;
        isCaptain.value = !!data.is_captain;
        captureStandard.value = data.capture_standard ?? 1;
        changeCardCount.value = data.change_card_count || [0, 0];
        changePending.value = !!data.my_change_pending;
        changeOriginIndex.value = data.my_change_origin_index ?? -1;
        changeOriginBoard.value = data.my_change_origin_board ?? -1;
        extraLines.value = data.extra_lines || [];
        leftTime.value = data.left_time;
        gameStatus.value = data.status;
        leftCdTime.value = data.left_cd_time;
        inited.value = true;
      })
      .catch(() => {})
      .finally(() => {
        gameDataLoading = false;
        if (gameDataRetry && roomStore.roomId) {
          gameDataRetry = false;
          void getGameData();
        }
      });
  };
  const clearPendingSpellStatusTimers = () => {
    pendingSpellStatusTimers.forEach((timer) => window.clearTimeout(timer));
    pendingSpellStatusTimers = [];
  };

  const scheduleSpellStatusUpdate = (index: number, status: number, delay: number) => {
    const timer = window.setTimeout(() => {
      spellStatus.value[index] = status;
      pendingSpellStatusTimers = pendingSpellStatusTimers.filter((item) => item !== timer);
    }, delay);
    pendingSpellStatusTimers.push(timer);
  };

  watch(
    () => roomStore.roomData.started,
    (started) => {
      if (started && !isReplayMode.value) getGameData();
    },
    {
      immediate: true,
    }
  );

  // 加入房间时 roomId 可能先于 started 更新；变更后补拉一次（观战加入中局的关键路径）
  watch(
    () => roomStore.roomId,
    (id) => {
      if (id && roomStore.roomData.started && !isReplayMode.value) getGameData();
    }
  );

  const resetGameData = () => {
    clearPendingSpellStatusTimers();
    spells.value = [];
    spellStatus.value = [];
    cells.value = [];
    cells2.value = [];
    mySelectedIndex.value = -1;
    mySelectedBoard.value = 0;
    myTeam.value = null;
    isCaptain.value = false;
    captureStandard.value = 1;
    changeCardCount.value = [0, 0];
    changePending.value = false;
    changeOriginIndex.value = -1;
    changeOriginBoard.value = -1;
    extraLines.value = [];
    leftTime.value = 0;
    countDownTime.value = 0;
    gameStatus.value = GameStatus.NOT_STARTED;
    leftCdTime.value = -1;
    gameLogs.splice(0);
    winner.value = null;
    inited.value = false;
    alreadySelectCard.value = false;
    spellCardGrabbedFlag.value = false;
    bpGameData.whose_turn = 0;
    bpGameData.ban_pick = 0;
    bpGameData.spell_failed_count_a = [];
    bpGameData.spell_failed_count_b = [];
    spells2.value = [];
    normalGameData.which_board_a = 0;
    normalGameData.which_board_b = 0;
    normalGameData.is_portal_a = [];
    normalGameData.is_portal_b = [];
    normalGameData.get_on_which_board = [];
    normalGameData.extra_lines = [];
    applyLinkData(null, true);
    linkLogSnapshot = null;
    currentBoard.value = 0;
  };

  watch(
    () => roomStore.roomId,
    (id) => {
      if (!id && !isReplayMode.value) resetGameData();
    }
  );

  const startGame = (payload?: any) => {
    return ws.send(WebSocketActionType.START_GAME, payload || {});
  };
  ws.on<RoomConfig>(WebSocketPushActionType.PUSH_START_GAME, (data) => {
    resetGameData();
    roomStore.applyRoomConfig(data, true);
    roomStore.roomData.started = true;
    roomStore.resetBanPick();
  });
  ws.on(WebSocketPushActionType.PUSH_RESET_ROOM, () => {
    if (!isReplayMode.value) resetGameData();
  });

  // const setPhase = (p) => {
  //   phase.value = p;
  //   return ws.send(WebSocketActionType.SET_PHASE, { phase: p });
  // };
  // const getPhase = () => {
  //   return ws.send(WebSocketActionType.GET_PHASE).then(({ phase }) => {
  //     phase.value = phase;
  //   });
  // };

  const stopGame = (winner: -1 | 0 | 1) => {
    return ws.send(WebSocketActionType.STOP_GAME, { winner });
  };
  ws.on<{ winner: -1 | 0 | 1 }>(WebSocketPushActionType.PUSH_STOP_GAME, (data) => {
    winner.value = data!.winner;
    roomStore.roomData.started = false;
    if (data!.winner !== -1) {
      roomStore.roomData.score[data!.winner]++;
    }
    resetGameData();
  });

  const pause = (pause: boolean) => {
    return ws.send(WebSocketActionType.PAUSE, { pause });
  };
  ws.on(WebSocketPushActionType.PUSH_PAUSE, ({ pause }) => {
    if (pause) {
      gameStatus.value = GameStatus.PAUSED;
    } else {
      gameStatus.value = GameStatus.STARTED;
    }
  });

  const setDebugSeplls = () => {
    return ws.send(WebSocketActionType.SET_DEBUG_SPELLS, { spells: debugSpellList.value });
  };

  const selectSpell = (index: number, board = currentBoard.value) => {
    return ws.send(WebSocketActionType.SELECT_SPELL, { index, board });
  };

  const finishSpell = (index: number) => {
    return ws.send(WebSocketActionType.FINISH_SPELL, { index, success: true });
  };

  const changeCard = () => {
    return ws.send(WebSocketActionType.CHANGE_CARD);
  };

  const updateCellState = (index: number, op: string, extra: any = {}) => {
    return ws.send(WebSocketActionType.UPDATE_CELL_STATE, {
      index,
      op,
      board: extra.board ?? currentBoard.value,
      ...extra,
    });
  };

  const refreshSpell = (index: number) => {
    return ws.send(WebSocketActionType.REFRESH_SPELL, { board_idx: currentBoard.value, spell_idx: index })
  };
  const boardSpec = () => new BoardSpec(roomStore.roomConfig.board_size || 5);
  const cellText = (index: number) => {
    const board = boardSpec();
    return `${board.row(index) + 1}行${board.col(index) + 1}列`;
  };
  const teamColor = (team: number | null | undefined) =>
    team === 0 ? "var(--A-color)" : team === 1 ? "var(--B-color)" : "";
  const actorHtml = (name: string, team: number | null | undefined, host?: string) => {
    const label = name || host || "导播";
    // 导播本身不着队伍色；只有目标成员/队伍需要队伍色
    const color = host && label === host ? "" : teamColor(team);
    return `<span style="padding:0 2px;color:${color}">${label}</span>`;
  };
  const memberHtml = (name: string | null | undefined, team: number | null | undefined) =>
    `<span style="padding:0 2px;color:${teamColor(team)}">${name || ""}</span>`;
  const teamHtml = (team: number | null | undefined) =>
    `<span style="padding:0 2px;color:${teamColor(team)}">${team === 0 ? "A队" : "B队"}</span>`;
  const spellCardHtml = (index: number, board: number) => {
    const list = board === 1 ? spells2.value : spells.value;
    const spell = list[index];
    const name = spell?.name || `#${index + 1}`;
    // 只有双盘才用背景色区分两面；单盘不加背景
    const dual = (roomStore.roomConfig.dual_board || 0) > 0;
    const background = dual
      ? `background-color:${board === 1 ? "var(--bg-color-reverse)" : "var(--bg-color)"};`
      : "";
    return `<span style="padding:0 2px;font-weight:600;${background}">${name}</span>`;
  };
  const victimsHtml = (victims: string[] = []) =>
    victims
      .map((name) => `<span style="padding:0 2px">${name}</span>`)
      .join("、");

  const formatActionLog = (data: any): string => {
    const op = data?.op;
    const board = data?.board ?? 0;
    const index = data?.index ?? -1;
    const pos = index >= 0 ? cellText(index) : "";
    const card = index >= 0 ? spellCardHtml(index, board) : "";
    // 导播操作时 actor_team 为 -1（无色）；无导播房为实际操作者队伍
    const actorTeam = data?.actor_team ?? data?.team;
    const actor = actorHtml(data?.actor || "", actorTeam, roomStore.roomData.host);
    switch (op) {
      case "select":
        return `${actor}选择了${pos}的符卡${card}`;
      case "cancel":
        return `${actor}取消了${pos}的选择`;
      case "capture_partial": {
        // 双盘每面只收 1 次，服务端 capture_standard 固定为 1，进度恒为 1/1，展示无意义
        const standard = data?.capture_standard ?? 1;
        const dual = (roomStore.roomConfig.dual_board || 0) > 0;
        const progress = !dual && standard > 1 ? `（${data?.capture_count}/${standard}）` : "";
        return `${actor}收取了${pos}的符卡${card}${progress}`;
      }
      case "capture_complete":
        return `${actor}收取了${pos}的符卡${card}`;
      case "grab_victim":
        return `${actorHtml(data?.by || data?.actor || "", actorTeam, roomStore.roomData.host)}抢了你选的符卡${card}`;
      case "grab_public":
        return `${actor}抢了${victimsHtml(data?.victims)}选的符卡${card}`;
      case "change":
        return `${actor}使用换卡，${data?.team === 0 ? "A队" : "B队"}剩余 ${data?.change_card_count} 次`;
      case "refund":
        return `${actor}换卡未生效，返还 1 次`;
      case "director_select":
        return `${actor}将${memberHtml(data?.name, data?.team)}设为选择${pos}的符卡${card}`;
      case "director_cancel":
        return `${actor}取消了${memberHtml(data?.name, data?.team)}在${pos}的选择`;
      case "director_capture":
        return `${actor}使${teamHtml(data?.team)}收取了${pos}的符卡${card}`;
      case "director_set":
        return `${actor}将${pos}设为${teamHtml(data?.team)}收取`;
      case "director_clear":
        return `${actor}将${pos}置空`;
      case "pause":
        return `${actor}暂停了比赛`;
      case "resume":
        return `${actor}继续了比赛`;
      default:
        return "";
    }
  };

  // 断线重连：服务端会重推阵容快照；若对局进行中，顺带重拉完整对局状态
  ws.on(WebSocketPushActionType.PUSH_ROSTER_UPDATE, (data: any) => {
    if (data?.started && !isReplayMode.value) getGameData();
  });

  ws.on(WebSocketPushActionType.PUSH_UPDATE_ONE_SPELL, (data) => {
    if (data!.board_idx == 0) {
      const newSpells = [...spells.value];
      newSpells[data!.spell_idx] = data!.spell;
      spells.value = newSpells;
    } else {
      const newSpells2 = [...spells2.value];
      newSpells2[data!.spell_idx] = data!.spell;
      spells2.value = newSpells2;
    }
    gameLogs.push(
      `${actorHtml(roomStore.roomData.host || "", null)}刷新了${cellText(data!.spell_idx)}的符卡${spellCardHtml(data!.spell_idx, data!.board_idx)}`
    );
  });

  const myCaptureFlag = ref(false);
  ws.on<{ board: number; cell: CellView }>(WebSocketPushActionType.PUSH_CELL_UPDATE, (data) => {
    if (!data) return;
    const list = data.board === 1 ? cells2.value : cells.value;
    const next = [...list];
    next[data.cell.index] = data.cell;
    if (data.board === 1) cells2.value = next;
    else cells.value = next;
  });

  ws.on<{ index: number; board: number }>(WebSocketPushActionType.PUSH_MY_SELECTION, (data) => {
    mySelectedIndex.value = data?.index ?? -1;
    mySelectedBoard.value = data?.board ?? 0;
    if (mySelectedIndex.value === -1) alreadySelectCard.value = false;
  });

  ws.on<{ index: number; board: number; left_cd_time: number }>(WebSocketPushActionType.PUSH_MY_CAPTURE, (data) => {
    leftCdTime.value = data?.left_cd_time ?? 0;
    alreadySelectCard.value = false;
    myCaptureFlag.value = true;
    nextTick(() => (myCaptureFlag.value = false));
  });

  ws.on(WebSocketPushActionType.PUSH_GRAB_ALERT, () => {
    spellCardGrabbedFlag.value = true;
  });

  ws.on<{ team: number; count: number; reason: string }>(
    WebSocketPushActionType.PUSH_UPDATE_CHANGE_CARD_COUNT,
    (data) => {
      if (data?.team !== 0 && data?.team !== 1) return;
      const next = [...changeCardCount.value];
      next[data.team] = data.count;
      changeCardCount.value = next;
    }
  );

  ws.on<{ pending: boolean; origin_index: number; origin_board: number }>(
    WebSocketPushActionType.PUSH_CHANGE_STATE,
    (data) => {
      changePending.value = !!data?.pending;
      changeOriginIndex.value = data?.origin_index ?? -1;
      changeOriginBoard.value = data?.origin_board ?? -1;
    }
  );

  ws.on(WebSocketPushActionType.PUSH_ACTION_LOG, (data) => {
    const text = formatActionLog(data);
    if (text) gameLogs.push(text);
  });

  //bp赛
  const bpGameData = reactive({
    whose_turn: 0, // 轮到谁了，0-左边，1-右边
    ban_pick: 1, // 0-选，1-ban，2-轮到收卡了
    spell_failed_count_a: [] as number[], // 左边玩家符卡的失败次数
    spell_failed_count_b: [] as number[], // 右边玩家符卡的失败次数
  });

  const normalGameData = reactive({
    which_board_a: 0,
    which_board_b: 0,
    is_portal_a: [] as number[],
    is_portal_b: [] as number[],
    get_on_which_board: [] as number[],
    extra_lines: [] as number[][],
  })

  const bpGameBanPick = (index: number) => {
    return ws.send(WebSocketActionType.BP_GAME_BAN_PICK, { idx: index });
  };

  const bpGameNextRound = () => {
    return ws.send(WebSocketActionType.BP_GAME_NEXT_ROUND);
  };
  ws.on<{ whose_turn: number; ban_pick: number }>(WebSocketPushActionType.PUSH_BP_GAME_NEXT_ROUND, (data) => {
    bpGameData.whose_turn = data!.whose_turn;
    bpGameData.ban_pick = data!.ban_pick;
  });

  const linkPayload = (playerIndex?: number) => playerIndex == null ? {} : { player_index: playerIndex };
  const linkRoute = (index: number, playerIndex?: number) => ws.send(WebSocketActionType.LINK_ROUTE, { index, ...linkPayload(playerIndex) });
  const linkUndo = (playerIndex?: number) => ws.send(WebSocketActionType.LINK_UNDO, linkPayload(playerIndex));
  const linkConfirmRoute = (confirmed: boolean, playerIndex?: number) => ws.send(WebSocketActionType.LINK_CONFIRM_ROUTE, { confirmed, ...linkPayload(playerIndex) });
  const linkNextCard = (playerIndex?: number) => ws.send(WebSocketActionType.LINK_NEXT_CARD, linkPayload(playerIndex));
  const linkFinishCard = (playerIndex?: number) => ws.send(WebSocketActionType.LINK_FINISH_CARD, linkPayload(playerIndex));
  const linkSkipCard = (playerIndex?: number) => ws.send(WebSocketActionType.LINK_SKIP_CARD, linkPayload(playerIndex));
  const linkForceSkip = (playerIndex: number) => ws.send(WebSocketActionType.LINK_FORCE_SKIP, { player_index: playerIndex });
  const linkUndoFinish = (playerIndex: number) => ws.send(WebSocketActionType.LINK_UNDO_FINISH, { player_index: playerIndex });
  const linkSetSkipUsed = (playerIndex: number, value: number) => ws.send(WebSocketActionType.LINK_SET_SKIP_USED, { player_index: playerIndex, value });
  const linkSetPhase = (phase: number) => ws.send(WebSocketActionType.LINK_SET_PHASE, { phase });
  const linkAiSpeedrun = () => ws.send(WebSocketActionType.LINK_AI_SPEEDRUN);
  const linkTakeoverRoute = (playerIndex: number) => ws.send(WebSocketActionType.LINK_TAKEOVER_ROUTE, { player_index: playerIndex });
  const linkReleaseTakeover = () => ws.send(WebSocketActionType.LINK_RELEASE_TAKEOVER);

  const linkPlayerName = (playerIndex: 0 | 1) => {
    const name = roomStore.roomData.names[playerIndex] || (playerIndex === 0 ? "A" : "B");
    const color = playerIndex === 0 ? "var(--A-color)" : "var(--B-color)";
    return `<span style="padding:0 2px;color:${color}">${name}</span>`;
  };
  const linkSpellName = (index: number) => {
    const name = spells.value[index]?.name || `#${index + 1}`;
    return `<span style="padding:0 2px;font-weight:600;">${name}</span>`;
  };
  const linkCellText = (index: number) => {
    const board = new BoardSpec(roomStore.roomConfig.board_size || 5);
    return `${board.row(index) + 1}行${board.col(index) + 1}列`;
  };
  const pushLinkPlayerLogs = (
    oldData: LinkData,
    newData: LinkData,
    playerIndex: 0 | 1,
    routeKey: "link_idx_a" | "link_idx_b",
    confirmedKey: "route_confirmed_a" | "route_confirmed_b",
    stepKey: "current_step_a" | "current_step_b",
    skipKey: "skip_used_a" | "skip_used_b",
    eventKey: "event_a" | "event_b"
  ) => {
    const player = linkPlayerName(playerIndex);
    const oldRoute = oldData[routeKey] || [];
    const newRoute = newData[routeKey] || [];
    const oldStep = oldData[stepKey] || 0;
    const newStep = newData[stepKey] || 0;
    const oldSkip = oldData[skipKey] || 0;
    const newSkip = newData[skipKey] || 0;

    if (!oldData[confirmedKey] && newData[confirmedKey]) {
      gameLogs.push(`${player}确认路线`);
    } else if (oldData[confirmedKey] && !newData[confirmedKey]) {
      gameLogs.push(`${player}取消确认路线`);
    }

    if (oldData[eventKey] === 0 && newData[eventKey] === 1) {
      gameLogs.push(`${player}开始收取路线`);
    }

    if (newStep > oldStep) {
      for (let step = oldStep; step < newStep; step++) {
        const index = newRoute[step];
        if (index == null) continue;
        const skipped = newSkip > oldSkip && step === newStep - 1;
        gameLogs.push(`${player}${skipped ? "跳过" : "收取"}了${linkCellText(index)}的符卡${linkSpellName(index)}`);
      }
    } else if (newStep < oldStep) {
      const index = oldRoute[Math.max(newStep, 0)];
      if (index != null) {
        gameLogs.push(`${player}撤销收取${linkCellText(index)}的符卡${linkSpellName(index)}`);
      }
    } else if (newSkip !== oldSkip) {
      gameLogs.push(`${player}跳过次数调整为${newSkip}`);
    }

    if (oldData[eventKey] !== 3 && newData[eventKey] === 3) {
      gameLogs.push(`${player}完成路线`);
    }
  };
  const pushLinkLogs = (oldData: LinkData, newData: LinkData) => {
    pushLinkPlayerLogs(oldData, newData, 0, "link_idx_a", "route_confirmed_a", "current_step_a", "skip_used_a", "event_a");
    pushLinkPlayerLogs(oldData, newData, 1, "link_idx_b", "route_confirmed_b", "current_step_b", "skip_used_b", "event_b");
  };

  ws.on<LinkData>(WebSocketPushActionType.PUSH_LINK_DATA, (data) => {
    const oldData = linkLogSnapshot ? cloneLinkData(linkLogSnapshot) : cloneLinkData(linkGameData);
    applyLinkData(data);
    const newData = cloneLinkData(linkGameData);
    if (linkLogSnapshot && roomStore.roomData.type === BingoType.LINK) {
      pushLinkLogs(oldData, newData);
    }
    linkLogSnapshot = newData;
  });

  const setReplayMode = (isReplay: boolean) => {
      isReplayMode.value = isReplay;
  }

  const startCustomGame = (preset: EditorPreset) => {
    // 构造发送给服务器的 Payload
    // 注意：这里假设服务器端接收的字段名与前端保持一致或为下划线风格
    // 根据 RoomConfig 定义，字段已经是 snake_case，所以直接传 roomConfig 即可
    const payload = {
      room_config: preset.data.roomConfig,
      spells: preset.data.spells,
      spells2: preset.data.spells2,
      spell_status: preset.data.spellStatus,
      initial_left_time: preset.data.initialLeftTime,
      initial_countdown: preset.data.initialCountDown,
      initial_cd_time_a: preset.data.initialCdTimeA,
      initial_cd_time_b: preset.data.initialCdTimeB,
      is_portal_a: preset.data.isPortalA,
      is_portal_b: preset.data.isPortalB,
    };
    return ws.send(WebSocketActionType.START_CUSTOM_GAME, payload);
  };

  return {
    spells,
    spellStatus,
    cells,
    cells2,
    mySelectedIndex,
    mySelectedBoard,
    myTeam,
    isCaptain,
    captureStandard,
    changeCardCount,
    changePending,
    changeOriginIndex,
    changeOriginBoard,
    extraLines,
    myCaptureFlag,
    leftTime,
    countDownTime,
    gameStatus,
    leftCdTime,
    debugSpellList,
    gameLogs,
    playerASelectedIndex,
    playerBSelectedIndex,
    inited,
    spellCardGrabbedFlag,
    bpGameData,
    linkGameData,
    normalGameData,
    alreadySelectCard,
    spells2,
    currentBoard,
    isReplayMode,
    startGame,
    getGameData,
    stopGame,
    pause,
    setDebugSeplls,
    selectSpell,
    finishSpell,
    changeCard,
    updateCellState,
    bpGameBanPick,
    bpGameNextRound,
    linkRoute,
    linkUndo,
    linkConfirmRoute,
    linkNextCard,
    linkFinishCard,
    linkSkipCard,
    linkForceSkip,
    linkUndoFinish,
    linkSetSkipUsed,
    linkSetPhase,
    linkAiSpeedrun,
    linkTakeoverRoute,
    linkReleaseTakeover,
    refreshSpell,
    resetGameData,
    setReplayMode,
    startCustomGame,
  };
});
