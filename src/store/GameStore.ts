import { defineStore } from "pinia";
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useRoomStore } from "./RoomStore";
import { BingoType, GameData, GameStatus, OneSpell, RoomConfig, Spell, SpellStatus, EditorPreset, LinkData } from "@/types";
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
  const spellStatus = ref<SpellStatus[]>([]);
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
      leftCdTime.value = 0;
      nextTick(() => {
        spellCardGrabbedFlag.value = false;
      });
    }
  });

  const bothSelectedIndex = computed(() => spellStatus.value.indexOf(SpellStatus.BOTH_SELECTED));
  const playerASelectedIndex = computed(() =>
    bothSelectedIndex.value === -1 ? spellStatus.value.indexOf(SpellStatus.A_SELECTED) : bothSelectedIndex.value
  );
  const playerBSelectedIndex = computed(() =>
    bothSelectedIndex.value === -1 ? spellStatus.value.indexOf(SpellStatus.B_SELECTED) : bothSelectedIndex.value
  );

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

  const getGameData = () => {
    const requestRoomId = roomStore.roomId;
    return ws
      .send(WebSocketActionType.GET_ALL_SPELLS)
      .then((data: GameData) => {
        if (requestRoomId !== roomStore.roomId) return;
        if (data.room_config) roomStore.applyRoomConfig(data.room_config, true);
        spells.value = data.spells;
        spells2.value = data.spells2 || [];
        spellStatus.value = data.spell_status;
        leftTime.value = data.left_time;
        gameStatus.value = data.status;
        leftCdTime.value = data.left_cd_time;
        inited.value = true;
        for (const i in data.bp_data) {
          bpGameData[i] = data.bp_data[i];
        }
        if (data.normal_data) {
          for (const i in data.normal_data) {
            normalGameData[i] = data.normal_data[i];
          }
        }
        applyLinkData(data.link_data as Partial<LinkData> | null, true);
        linkLogSnapshot = cloneLinkData(linkGameData);
      })
      .catch(() => {});
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

  const resetGameData = () => {
    clearPendingSpellStatusTimers();
    spells.value = [];
    spellStatus.value = [];
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

  const selectSpell = (index: number) => {
    return ws.send(WebSocketActionType.SELECT_SPELL, { index });
  };

  const finishSpell = (index: number, success = true, playerIndex?: 0 | 1) => {
    return ws.send(WebSocketActionType.FINISH_SPELL, { index, success, player_index: playerIndex });
  };

  const refreshSpell = (index: number) => {
    return ws.send(WebSocketActionType.REFRESH_SPELL, { board_idx: currentBoard.value, spell_idx: index })
  };
  ws.on<OneSpell>(WebSocketPushActionType.PUSH_UPDATE_ONE_SPELL, (data) => {
    const log: GameLog = {
      index: data!.spell_idx,
      status: 0x100,
      oldStatus: 0,
      causer: data!.player_name,
    };
    gameLogs.push(getSepllCardLog(log))
    if(data!.board_idx == 0){
      const newSpells = [...spells.value]; // 1. Create a shallow copy of the current array
      newSpells[data!.spell_idx] = data!.spell; // 2. Update the element in the new array
      spells.value = newSpells; // 3. Assign the new array back to the ref
    }else if(data!.board_idx == 1){
      const newSpells2 = [...spells2.value];
      newSpells2[data!.spell_idx] = data!.spell;
      spells2.value = newSpells2;
    }
  })

  const updateSpellStatus = (index, status) => {
    return ws.send(WebSocketActionType.UPDATE_SPELL_STATUS, { index, status });
  };
  ws.on<{
    index: number;
    status: number;
    causer: string;
    spell_failed_count_a?: number;
    spell_failed_count_b?: number;
    which_board_a?: number;
    which_board_b?: number;
    get_on_which_board?: number;
  }>(WebSocketPushActionType.PUSH_UPDATE_SEPLL_STATUS, (data) => {
    const log: GameLog = {
      index: data!.index,
      status: data!.status,
      oldStatus: spellStatus.value[data!.index],
      causer: data!.causer,
    };
    if (data!.spell_failed_count_a) {
      log.failCountA = data!.spell_failed_count_a;
      nextTick(() => {
        bpGameData.spell_failed_count_a[data!.index] = data!.spell_failed_count_a!;
      });
    }
    if (data!.spell_failed_count_b) {
      log.failCountB = data!.spell_failed_count_b;
      nextTick(() => {
        bpGameData.spell_failed_count_b[data!.index] = data!.spell_failed_count_b!;
      });
    }
    if(data!.which_board_a != null){
      normalGameData.which_board_a = data!.which_board_a!;
    }
    if(data!.which_board_b != null){
      normalGameData.which_board_b = data!.which_board_b!;
    }
    if(data!.get_on_which_board){
      log.getOnWhichBoard = data!.get_on_which_board;
      normalGameData.get_on_which_board[data!.index] = data!.get_on_which_board!;
    }
    const logText = getSepllCardLog(log);
    gameLogs.push(logText);

    if (roomStore.isHost) {
      if (data!.causer === roomStore.roomData.names[0]) {
        scheduleSpellStatusUpdate(data!.index, data!.status, roomStore.roomSettings.playerA.delay * 1000);
      } else if (data!.causer === roomStore.roomData.names[1]) {
        scheduleSpellStatusUpdate(data!.index, data!.status, roomStore.roomSettings.playerB.delay * 1000);
      } else {
        spellStatus.value[data!.index] = data!.status;
      }
    } else {
      spellStatus.value[data!.index] = data!.status;
    }
  });

  const getSepllCardLog = ({
                             index,
                             status,
                             oldStatus,
                             causer,
                             failCountA,
                             failCountB,
                           }: {
    index: number;
    status: number;
    oldStatus: number;
    causer: string;
    failCountA?: number;
    failCountB?: number;
  }) => {
    let str = "";
    const playerA = `<span style="padding:0 2px;color:var(--A-color)">${roomStore.roomData.names[0]}</span>`;
    const playerB = `<span style="padding:0 2px;color:var(--B-color)">${roomStore.roomData.names[1]}</span>`;
    const host = `<span style="padding:0 2px;font-weight:600">${roomStore.roomData.host}</span>`;

    let side = 0;
    //操作是谁发出的？
    const fromPlayerA = roomStore.roomData.names[0] === causer;
    const fromPlayerB = roomStore.roomData.names[1] === causer;
    const fromHost = roomStore.roomData.host === causer;
    //目前前端是谁？
    const isPA = roomStore.isPlayerA;
    const isPB = roomStore.isPlayerB;

    //考虑状态转换带来的事件
    //注意事件需要符合发起者身份，不符合则认为是直接设置
    //选卡两种情况
    const actASelect = ((oldStatus === 0 && status === 1) || (oldStatus === 3 && status === 2)) && fromPlayerA;
    const actBSelect = ((oldStatus === 0 && status === 3) || (oldStatus === 1 && status === 2)) && fromPlayerB;
    //收卡只需要判断最终状态
    const actAGet = status === 5 && fromPlayerA;
    const actBGet = status === 7 && fromPlayerB;
    //被抢卡只有自己可见
    const actALost = (oldStatus === 1 || oldStatus === 2) && status === 7 && isPA && fromPlayerB;
    const actBLost = (oldStatus === 3 || oldStatus === 2) && status === 5 && isPB && fromPlayerA;
    //否则，为状态设置
    const isPlayerSet = !(actASelect || actBSelect || actAGet || actBGet || actALost || actBLost);

    if (actALost || actBLost) {
      spellCardGrabbedFlag.value = true;
    }

    if(isPlayerSet || fromHost){
      if((oldStatus === 1 || oldStatus === 2) && status === 7 && isPA){
        spellCardGrabbedFlag.value = true;
      }else if((oldStatus === 3 || oldStatus === 2) && status === 5 && isPB){
        spellCardGrabbedFlag.value = true;
      }
    }

    // 选卡CD只由"自己收卡"触发：服务端只在收卡者身上更新 lastGetTime
    // 不能依赖选卡按钮重新挂载来推断CD，否则取消选卡（按钮同样会重新挂载）也会错误进入倒计时
    if((isPA && actAGet) || (isPB && actBGet)){
      leftCdTime.value = isPA ? roomStore.actualCdTimeA : roomStore.actualCdTimeB;
    }

      //如果是收卡行为，检查在哪一面收卡
      //导播直接覆盖
      if (fromHost && (actAGet || actBGet)) {
        const get = normalGameData.get_on_which_board[index];
        if ((get === 0x2 || get === 0x20)) {
          side = 1;
        }
      } else if (!fromHost) {
        //选手考虑2种状态：my-select -> my-get,  my/both-select -> op-get
        //B被抢卡
        if (actBLost) {
          side = normalGameData.which_board_b;
          //A被抢卡
        } else if (actALost) {
          side = normalGameData.which_board_a;
          //收卡用收取记录判定
        } else if (actAGet || actBGet) {
          const get = normalGameData.get_on_which_board[index];
          if ((get === 0x2 || get === 0x20)) {
            side = 1;
          }
        }
      }

      //如果是选卡行为，直接返回对应选手所在面
      if (actASelect) {
        side = normalGameData.which_board_a;
      } else if (actBSelect) {
        side = normalGameData.which_board_b;
      }

      //如果是设置行为，先定位设置的是谁，再返回其所在面
      if (isPlayerSet) {
        if (status === 1) {
          side = normalGameData.which_board_a;
        } else if (status === 3) {
          side = normalGameData.which_board_b;
        } else if (status === 5 || status === 7) {
          //设置收取同导播
          const get = normalGameData.get_on_which_board[index];
          if ((get === 0x2 || get === 0x20)) {
            side = 1;
          }
        } else if (status === 2) {
          if (oldStatus === 1) {
            side = normalGameData.which_board_b;
          } else if (oldStatus === 3) {
            side = normalGameData.which_board_a;
          }
          //其余情况不分人，只需要找到发起者
        } else {
          if (fromPlayerA) {
            side = normalGameData.which_board_a;
          } else if (fromPlayerB) {
            side = normalGameData.which_board_b;
          }
        }
      }

      //roomSettings对非房主无效？所以用Spell2判定
    const isDual = spells2.value.length > 0;
    const curSpellList = computed(() => (side === 1 && isDual ? spells2.value : spells.value) )
    const spellCard = isDual ?
      `<span style="padding:0 2px;font-weight:600;background-color: var(--${side === 0 ? 'bg-color':'bg-color-reverse'})">
      ${curSpellList.value[index].name}</span>`
    :
        `<span style="padding:0 2px;font-weight:600;">${curSpellList.value[index].name}</span>`
    ;

    const board = new BoardSpec(roomStore.roomConfig.board_size || 5);
    const row = board.row(index)+1;
    const col = board.col(index)+1;

    if(!fromHost){
      if(fromPlayerA){
        str += playerA;
      }else if(fromPlayerB){
        str += playerB;
      }

      if(isPlayerSet){
        str += `将${row}行${col}列的${spellCard}`;
        switch(status){
          case -1: str += `禁用`; break;
          case 0: str += `置空`; break;
          case 1: str += `设为左侧选择`; break;
          case 2: str += `设为双方选择`; break;
          case 3: str += `设为右侧选择`; break;
          case 5: str += `设为左侧收取`; break;
          case 6: str += `设为双方收取`; break;
          case 7: str += `设为右侧收取`; break;
        }
      }else if(actALost || actBLost){
        str += `抢了你选的符卡${spellCard}`
      }else if(actAGet || actBGet){
        str += `收取了${row}行${col}列的符卡${spellCard}`;
      }else if(actASelect || actBSelect){
        str += `选择了${row}行${col}列的符卡${spellCard}`;
      }
    }else{
      if (roomStore.roomData.type === BingoType.BP) {
        const currentCountA = bpGameData.spell_failed_count_a[index];
        const currentCountB = bpGameData.spell_failed_count_b[index];
        if (failCountA! > currentCountA) {
          return `${playerA}收取符卡${spellCard}失败`;
        }
        if (failCountB! > currentCountB) {
          return `${playerB}收取符卡${spellCard}失败`;
        }
      }
      str = `${host}把符卡${spellCard}`;
      switch (status) {
        case -1:
          str += "设置为禁用";
          break;
        case 0:
          str += "状态置空";
          break;
        case 1:
          str += `设置为${playerA}选择`;
          break;
        case 2:
          str += "设置为双方选择";
          break;
        case 3:
          str += `设置为${playerB}选择`;
          break;
        case 5:
          str += `设置为${playerA}收取`;
          break;
        case 6:
          str += "设置为双方收取";
          break;
        case 7:
          str += `设置为${playerB}收取`;
          break;
        case 0x100:
          str += `刷新，该符卡位于${board.row(index)+1}行${board.col(index)+1}列`
          break;
      }
    }

    return str;
  };

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

  watch(
    () => normalGameData.which_board_a,
    (newVal, oldVal) => {
      if (roomStore.isPlayerA){
        currentBoard.value = newVal;
      }
    },
    {
      immediate: true,
      deep: true,
    }
  );

  watch(
    () => normalGameData.which_board_b,
    (boardB) => {
      if (roomStore.isPlayerB){
        currentBoard.value = boardB;
      }
    },
    {
      immediate: true,
      deep: true,
    }
  );

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
    updateSpellStatus,
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
