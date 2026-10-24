import { BingoType, BpStatus, RoomTeamInfo, RoomTeamMemberInfo } from "@/types";
import { defineStore } from "pinia";
import { computed, ref, reactive, watch, nextTick } from "vue";
import { useLocalStore } from "./LocalStore";
import ws from "@/utils/webSocket/WebSocketBingo";
import { WebSocketActionType, WebSocketPushActionType } from "@/utils/webSocket/types";
import { local } from "@/utils/Storage";
import Config from "@/config";
import { useRoute, useRouter } from "vue-router";
import { useCustomCardPoolStore } from "@/store/CustomCardPoolStore";
import { useOnlineCustomPoolStore } from "@/store/OnlineCustomPoolStore";
import pako from "pako";

export const useRoomStore = defineStore("room", () => {
  const localStore = useLocalStore();
  const router = useRouter();
  const customCardPoolStore = useCustomCardPoolStore();
  const onlineCustomPoolStore = useOnlineCustomPoolStore();

  const roomId = ref<string>("");
  watch(roomId, (id) => {
    if (id) {
      router.push(`/room/${id}`);
    } else {
      router.push(`/`);
    }
  });

  const isReplayActive = ref(false);
  const setReplayActive = (active: boolean) => {
    isReplayActive.value = active;
  };
  const inRoom = computed(() => isReplayActive.value || isHost.value || isPlayer.value || isWatcher.value);
  const inGame = computed(() => roomData.started);
  /** 当前用户对应的成员（非选手为 null） */
  const myMember = computed(() => {
    for (const team of roomData.teams || []) {
      const found = team.members.find((m) => m.name === localStore.username);
      if (found) return found;
    }
    return null;
  });
  /** 当前用户所在队伍：0=A，1=B，null=非选手 */
  const myTeam = computed<number | null>(() => {
    const teams = roomData.teams || [];
    for (let i = 0; i < teams.length; i++) {
      if (teams[i].members.some((m) => m.name === localStore.username)) return i;
    }
    return null;
  });
  const isCaptain = computed(() => !!myMember.value?.captain);
  const isPlayerA = computed(() => myTeam.value === 0);
  const isPlayerB = computed(() => myTeam.value === 1);
  const isPlayer = computed(() => myTeam.value !== null);
  const isWatcher = computed(() => roomData.watchers.indexOf(localStore.username) !== -1);
  const isHost = computed(() => roomData.host === localStore.username);
  const rosterLocked = computed(() => !!roomData.roster_locked);
  const teamMembers = (team: number) => (roomData.teams || [])[team]?.members || [];
  /** 按加入顺序混排的成员列表；切队不改变显示位置 */
  const orderedMembers = computed(() => {
    const list: Array<RoomTeamMemberInfo & { team: number }> = [];
    (roomData.teams || []).forEach((team, ti) => {
      team.members.forEach((m, idx) => {
        list.push({
          ...m,
          team: ti,
          order: typeof m.order === "number" ? m.order : ti * 1000 + idx,
        });
      });
    });
    return list.sort((a, b) => a.order - b.order);
  });
  const isTeamEmpty = (team: number) => teamMembers(team).length === 0;
  const bothTeamsReady = computed(() => {
    if (roomData.practice) {
      const a = teamMembers(0);
      return a.length > 0 && a.filter((m) => m.captain).length === 1;
    }
    return [0, 1].every((i) => {
      const members = teamMembers(i);
      return members.length > 0 && members.filter((m) => m.captain).length === 1;
    });
  });
  const inMatch = computed(() => {
    const score = roomData.score;
    const totalScore = score[0] + score[1];
    if (totalScore > 0 || banPick.phase > 0 || !!roomData.started) {
      return true;
    } else {
      return false;
    }
  });
  const soloMode = computed(() => !roomData.host);
  const practiceMode = computed(() => !!roomData.practice);

  //成员连接状态，按队伍分组（自己由本地指示器负责）
  type RemotePlayerStatus = { name: string; online: boolean; team: number };
  const remotePlayerStatuses = computed<RemotePlayerStatus[]>(() => {
    // 回放中的选手是历史记录，实时连接状态没有意义，隐藏指示器
    if (!inRoom.value || isReplayActive.value) return [];
    const onlineMap = roomData.players_online || {};
    const result: RemotePlayerStatus[] = [];
    for (let team = 0; team < (roomData.teams || []).length; team++) {
      for (const member of roomData.teams[team].members) {
        if (member.name === localStore.username) continue;
        // 缺少条目视为在线：能出现在座位上说明刚执行过操作
        result.push({ name: member.name, online: onlineMap[member.name] ?? true, team });
      }
    }
    return result;
  });

  const gameTimeLimit = {};
  const countdownTime = {};
  for (const item of Config.gameTypeList) {
    gameTimeLimit[item.type] = item.timeLimit;
    countdownTime[item.type] = item.countdown;
  }
  const boardSizeDefaults = {
    gameTime: { 4: 20, 5: 30, 6: 42 },
    countdown: { 4: 60, 5: 90, 6: 120 },
    linkGameTime: { 4: 30, 5: 50, 6: 75 },
    linkCountdown: { 4: 225, 5: 300, 6: 420 },
    portalCount: { 4: 3, 5: 5, 6: 6 },
    hiddenThreshold: { 4: 3, 5: 5, 6: 7 },
    extraLineCount: { 4: 0, 5: 0, 6: 2 },
    customLevelCount: {
      4: [1, 3, 8, 3, 1, 1, 0, 3, 1, 1, 4],
      5: [2, 6, 12, 4, 1, 1, 0, 4, 1, 1, 5],
      6: [4, 9, 16, 6, 1, 1, 0, 5, 1, 1, 6],
    },
  };
  const defaultCustomCountsForBoard = (boardSize: number): number[] => {
    return [...(boardSizeDefaults.customLevelCount[boardSize as keyof typeof boardSizeDefaults.customLevelCount] || boardSizeDefaults.customLevelCount[5])];
  };
  const boardSizeKeys = [4, 5, 6];
  const defaultLinkBoardSettingsForBoard = (boardSize: number) => ({
    disabled: [] as number[],
    startA: 0,
    endA: boardSize * boardSize - 1,
    startB: boardSize - 1,
    endB: boardSize * (boardSize - 1),
  });
  type LinkBoardSettings = ReturnType<typeof defaultLinkBoardSettingsForBoard>;

  //本地房间设置
  const roomSettings = reactive({
    type: BingoType.STANDARD,
    gameTimeLimit,
    countdownTime,
    gameTimeByBoardSize: { ...boardSizeDefaults.gameTime },
    countdownByBoardSize: { ...boardSizeDefaults.countdown },
    linkGameTimeByBoardSize: { ...boardSizeDefaults.linkGameTime },
    linkCountdownByBoardSize: { ...boardSizeDefaults.linkCountdown },
    portalCountByBoardSize: { ...boardSizeDefaults.portalCount },
    hiddenThresholdAByBoardSize: { ...boardSizeDefaults.hiddenThreshold },
    hiddenThresholdBByBoardSize: { ...boardSizeDefaults.hiddenThreshold },
    extraLineCountByBoardSize: { ...boardSizeDefaults.extraLineCount },
    customLevelCountByBoardSize: {
      4: [...boardSizeDefaults.customLevelCount[4]],
      5: [...boardSizeDefaults.customLevelCount[5]],
      6: [...boardSizeDefaults.customLevelCount[6]],
    },
    cdTime: 30,
    cdModifierA: 0, // 左侧选手CD修正值
    cdModifierB: 0, // 右侧选手CD修正值
    format: 1,
    checkList: ["6", "7", "8", "10", "11", "12", "13", "14", "15", "16", "17", "18"],
    systemCardPoolCheckList: ["6", "7", "8", "10", "11", "12", "13", "14", "15", "16", "17", "18"],
    customCardPoolCheckList: ["6", "7", "8", "10", "11", "12", "13", "14", "15", "16", "17", "18"],
    rankList: ["L", "EX"],
    difficulty: 3,
    bgmMuted: false,
    sfxMuted: false,
    gamebp: false,
    matchbp: false,
    confirmDelay: 5,
    playerA: {
      color: "hsl(16, 100%, 50%)",
      delay: 5,
      changeCardCount: 2,
    },
    playerB: {
      color: "hsl(210, 100%, 56%)",
      delay: 5,
      changeCardCount: 2,
    },
    backgroundColor: "hsl(58, 63%, 79%)",
    backgroundColorReverse: "hsl(258, 100%, 77%)",
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
    noWinningDeclaration: false,
    autoSwitchInDualMode: false,
    autoSwitchInterval: 20,
    extraLineColor: "#0ce739",
    linkPathColorA: "hsl(16, 100%, 50%)",
    linkPathColorB: "hsl(210, 100%, 56%)",
    game_weight: {},
    ai_preference: {},
    custom_level_count: [2, 6, 12, 4, 1, 1, 0, 4, 1, 1, 5],
    board_size: 5,
    extra_line_count: 2,
    link_level_coefficient: 15,
    link_fastest_coefficient: 0,
    link_connectivity: 8,
    link_disabled_idx: [] as number[],
    link_start_a: 0,
    link_end_a: 24,
    link_start_b: 4,
    link_end_b: 20,
    linkBoardSettingsByBoardSize: {
      4: defaultLinkBoardSettingsForBoard(4),
      5: defaultLinkBoardSettingsForBoard(5),
      6: defaultLinkBoardSettingsForBoard(6),
    } as Record<number, LinkBoardSettings>,
    custom_card_pool_enabled: false,
    pick_guarantee_count: 0,
    capture_standard: 1,
    copy_board: false,
  });

  //加载本地设置
  const loadRoomSettings = () => {
    const savedSettings = local.get("roomSettings") || {};
    for (const i in savedSettings) {
      roomSettings[i] = savedSettings[i];
    }
    if (roomSettings.board_size === undefined) roomSettings.board_size = 5;
    if (roomSettings.extra_line_count === undefined) roomSettings.extra_line_count = 2;
    if (roomSettings.difficulty === 0) roomSettings.difficulty = 3;
    if (roomSettings.extraLineColor === undefined) roomSettings.extraLineColor = "#0ce739";
    if (roomSettings.linkPathColorA === undefined) roomSettings.linkPathColorA = roomSettings.playerA.color;
    if (roomSettings.linkPathColorB === undefined) roomSettings.linkPathColorB = roomSettings.playerB.color;
    if (roomSettings.link_level_coefficient === undefined) roomSettings.link_level_coefficient = 15;
    if (roomSettings.link_fastest_coefficient === undefined) roomSettings.link_fastest_coefficient = 0;
    if (roomSettings.link_connectivity === undefined) roomSettings.link_connectivity = 8;
    if (roomSettings.custom_card_pool_enabled === undefined) roomSettings.custom_card_pool_enabled = false;
    if (roomSettings.pick_guarantee_count === undefined) roomSettings.pick_guarantee_count = 0;
    if (roomSettings.capture_standard === undefined) roomSettings.capture_standard = 1;
    if (roomSettings.copy_board === undefined) roomSettings.copy_board = false;
    if (!Array.isArray(roomSettings.systemCardPoolCheckList)) {
      roomSettings.systemCardPoolCheckList = [...roomSettings.checkList];
    }
    if (!Array.isArray(roomSettings.customCardPoolCheckList)) {
      roomSettings.customCardPoolCheckList = [...roomSettings.checkList];
    }
    roomSettings.checkList = [
      ...(roomSettings.custom_card_pool_enabled
        ? roomSettings.customCardPoolCheckList
        : roomSettings.systemCardPoolCheckList),
    ];
    // 多人版只支持标准赛，忽略历史设置里的 BP/Link 类型
    roomSettings.type = BingoType.STANDARD;
    normalizeBoardSizeCaches(savedSettings || {});
    normalizeLinkBoardSettingsCache(savedSettings || {});
    normalizeLinkSettings();
    //checkAIPracticeEnabled();
  };
  loadRoomSettings();

  function normalizeBoardSizeCaches(savedSettings: any) {
    const boardSize = boardSizeKeys.includes(roomSettings.board_size) ? roomSettings.board_size : 5;
    roomSettings.gameTimeByBoardSize = normalizeBoardSizeCache(
      roomSettings.gameTimeByBoardSize,
      boardSizeDefaults.gameTime,
      boardSize,
      savedSettings.gameTimeLimit?.[BingoType.STANDARD]
    );
    roomSettings.countdownByBoardSize = normalizeBoardSizeCache(
      roomSettings.countdownByBoardSize,
      boardSizeDefaults.countdown,
      boardSize,
      savedSettings.countdownTime?.[BingoType.STANDARD]
    );
    roomSettings.linkGameTimeByBoardSize = normalizeBoardSizeCache(
      roomSettings.linkGameTimeByBoardSize,
      boardSizeDefaults.linkGameTime,
      boardSize,
      savedSettings.gameTimeLimit?.[BingoType.LINK]
    );
    roomSettings.linkCountdownByBoardSize = normalizeBoardSizeCache(
      roomSettings.linkCountdownByBoardSize,
      boardSizeDefaults.linkCountdown,
      boardSize,
      savedSettings.countdownTime?.[BingoType.LINK]
    );
    roomSettings.portalCountByBoardSize = normalizeBoardSizeCache(
      roomSettings.portalCountByBoardSize,
      boardSizeDefaults.portalCount,
      boardSize,
      savedSettings.portal_count
    );
    roomSettings.hiddenThresholdAByBoardSize = normalizeBoardSizeCache(
      roomSettings.hiddenThresholdAByBoardSize,
      boardSizeDefaults.hiddenThreshold,
      boardSize,
      savedSettings.hidden_select_threshold_a
    );
    roomSettings.hiddenThresholdBByBoardSize = normalizeBoardSizeCache(
      roomSettings.hiddenThresholdBByBoardSize,
      boardSizeDefaults.hiddenThreshold,
      boardSize,
      savedSettings.hidden_select_threshold_b
    );
    roomSettings.customLevelCountByBoardSize = normalizeCustomLevelCountCache(
      roomSettings.customLevelCountByBoardSize,
      boardSizeDefaults.customLevelCount,
      boardSize,
      savedSettings.custom_level_count
    ) as typeof roomSettings.customLevelCountByBoardSize;
    roomSettings.extraLineCountByBoardSize = normalizeBoardSizeCache(
      roomSettings.extraLineCountByBoardSize,
      boardSizeDefaults.extraLineCount,
      boardSize,
      savedSettings.extra_line_count
    );
    roomSettings.extra_line_count = roomSettings.extraLineCountByBoardSize[boardSize] ?? 0;
  }

  function normalizeLinkSettings() {
    const area = roomSettings.board_size * roomSettings.board_size;
    const defaultStartA = 0;
    const defaultEndA = area - 1;
    const defaultStartB = roomSettings.board_size - 1;
    const defaultEndB = roomSettings.board_size * (roomSettings.board_size - 1);
    const cached = roomSettings.linkBoardSettingsByBoardSize?.[roomSettings.board_size];
    if (cached) {
      roomSettings.link_disabled_idx = Array.isArray(cached.disabled) ? [...cached.disabled] : [];
      roomSettings.link_start_a = cached.startA;
      roomSettings.link_end_a = cached.endA;
      roomSettings.link_start_b = cached.startB;
      roomSettings.link_end_b = cached.endB;
    }
    const valid = (value: any, fallback: number) =>
      Number.isInteger(value) && value >= 0 && value < area ? value : fallback;
    roomSettings.link_start_a = valid(roomSettings.link_start_a, defaultStartA);
    roomSettings.link_end_a = valid(roomSettings.link_end_a, defaultEndA);
    roomSettings.link_start_b = valid(roomSettings.link_start_b, defaultStartB);
    roomSettings.link_end_b = valid(roomSettings.link_end_b, defaultEndB);
    if (roomSettings.link_start_a === roomSettings.link_end_a || roomSettings.link_start_b === roomSettings.link_end_b) {
      roomSettings.link_start_a = defaultStartA;
      roomSettings.link_end_a = defaultEndA;
      roomSettings.link_start_b = defaultStartB;
      roomSettings.link_end_b = defaultEndB;
    }
    const blocked = new Set([
      roomSettings.link_start_a,
      roomSettings.link_end_a,
      roomSettings.link_start_b,
      roomSettings.link_end_b,
    ]);
    roomSettings.link_disabled_idx = Array.isArray(roomSettings.link_disabled_idx)
      ? Array.from(new Set(roomSettings.link_disabled_idx.filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < area && !blocked.has(idx)))).sort((a, b) => a - b)
      : [];
    roomSettings.linkBoardSettingsByBoardSize[roomSettings.board_size] = {
      disabled: [...roomSettings.link_disabled_idx],
      startA: roomSettings.link_start_a,
      endA: roomSettings.link_end_a,
      startB: roomSettings.link_start_b,
      endB: roomSettings.link_end_b,
    };
  }

  function normalizeLinkBoardSettingsCache(savedSettings: any) {
    const cache = savedSettings.linkBoardSettingsByBoardSize || roomSettings.linkBoardSettingsByBoardSize || {};
    const normalized: Record<number, LinkBoardSettings> = {};
    for (const key of boardSizeKeys) {
      const defaults = defaultLinkBoardSettingsForBoard(key);
      const current = cache[key] || cache[String(key)];
      normalized[key] = {
        disabled: Array.isArray(current?.disabled) ? [...current.disabled] : [],
        startA: Number.isInteger(current?.startA) ? current.startA : defaults.startA,
        endA: Number.isInteger(current?.endA) ? current.endA : defaults.endA,
        startB: Number.isInteger(current?.startB) ? current.startB : defaults.startB,
        endB: Number.isInteger(current?.endB) ? current.endB : defaults.endB,
      };
    }
    if (!savedSettings.linkBoardSettingsByBoardSize) {
      normalized[roomSettings.board_size] = {
        disabled: Array.isArray(roomSettings.link_disabled_idx) ? [...roomSettings.link_disabled_idx] : [],
        startA: roomSettings.link_start_a,
        endA: roomSettings.link_end_a,
        startB: roomSettings.link_start_b,
        endB: roomSettings.link_end_b,
      };
    }
    roomSettings.linkBoardSettingsByBoardSize = normalized;
  }

  function normalizeBoardSizeCache(cache: any, defaults: Record<number, number>, currentBoardSize: number, legacyValue?: number) {
    const result = { ...defaults, ...(cache || {}) };
    if (typeof legacyValue === "number" && (!cache || cache[currentBoardSize] === undefined)) {
      result[currentBoardSize] = legacyValue;
    }
    return result;
  }

  function normalizeCustomLevelCountCache(
    cache: any,
    defaults: Record<number, number[]>,
    currentBoardSize: number,
    legacyValue?: number[]
  ): Record<number, number[]> {
    const result: Record<number, number[]> = {};
    for (const key of boardSizeKeys) {
      if (cache && cache[key] && Array.isArray(cache[key]) && cache[key].length === 11) {
        result[key] = [...cache[key]];
      } else {
        result[key] = [...defaults[key]];
      }
    }
    if (Array.isArray(legacyValue) && legacyValue.length === 11 && (!cache || !cache[currentBoardSize])) {
      result[currentBoardSize] = [...legacyValue];
    }
    return result;
  }

  const activeCustomLevelCount = () => roomSettings.customLevelCountByBoardSize[roomSettings.board_size] || defaultCustomCountsForBoard(roomSettings.board_size);

  const activeGameTime = () => {
    if (roomSettings.type === BingoType.STANDARD) return roomSettings.gameTimeByBoardSize[roomSettings.board_size];
    if (roomSettings.type === BingoType.LINK) return roomSettings.linkGameTimeByBoardSize[roomSettings.board_size];
    return roomSettings.gameTimeLimit?.[roomSettings.type];
  };

  const activeCountdown = () => {
    if (roomSettings.type === BingoType.STANDARD) return roomSettings.countdownByBoardSize[roomSettings.board_size];
    if (roomSettings.type === BingoType.LINK) return roomSettings.linkCountdownByBoardSize[roomSettings.board_size];
    return roomSettings.countdownTime?.[roomSettings.type];
  };

  const activePortalCount = () => roomSettings.portalCountByBoardSize[roomSettings.board_size];
  const activeHiddenThresholdA = () => roomSettings.hiddenThresholdAByBoardSize[roomSettings.board_size];
  const activeHiddenThresholdB = () => roomSettings.hiddenThresholdBByBoardSize[roomSettings.board_size];
  const activeExtraLineCount = () => roomSettings.board_size === 6 && roomSettings.type === BingoType.STANDARD
    ? roomSettings.extraLineCountByBoardSize[roomSettings.board_size] ?? 0
    : 0;
  const updateExtraLineCountCache = (value = roomSettings.extra_line_count) => {
    const count = Math.min(4, Math.max(0, Number(value) || 0));
    roomSettings.extra_line_count = count;
    roomSettings.extraLineCountByBoardSize[roomSettings.board_size] = count;
  };

  const syncActiveExtraLineCount = () => {
    roomSettings.extra_line_count = activeExtraLineCount();
  };

  const saveRoomSettings = () => {
    if (roomSettings.type === BingoType.LINK) {
      roomSettings.dual_board = 0;
      roomSettings.blind_setting = 1;
    }
    if (roomSettings.type === BingoType.BP && roomSettings.board_size !== 5) {
      roomSettings.board_size = 5;
    }
    if (roomSettings.type === BingoType.STANDARD && roomSettings.board_size === 6) {
      updateExtraLineCountCache();
    } else {
      syncActiveExtraLineCount();
    }
    checkAIPracticeEnabled();
    local.set("roomSettings", roomSettings);
  };

  const customCardPoolActive = computed(
    () => roomSettings.custom_card_pool_enabled &&
      (!!customCardPoolStore.selectedPayload || !!onlineCustomPoolStore.selectedMd5)
  );

  const isLocalPoolActive = computed(
    () => roomSettings.custom_card_pool_enabled && !!customCardPoolStore.selectedPayload
  );

  const isOnlinePoolActive = computed(
    () => roomSettings.custom_card_pool_enabled && !!onlineCustomPoolStore.selectedMd5
  );

  const syncActiveCardPoolGameSelection = () => {
    if (roomSettings.custom_card_pool_enabled) {
      roomSettings.customCardPoolCheckList = [...roomSettings.checkList];
    } else {
      roomSettings.systemCardPoolCheckList = [...roomSettings.checkList];
    }
  };

  const setCustomCardPoolEnabled = (enabled: boolean) => {
    if (roomSettings.custom_card_pool_enabled === enabled) return;
    syncActiveCardPoolGameSelection();
    roomSettings.custom_card_pool_enabled = enabled;
    roomSettings.checkList = [
      ...(enabled ? roomSettings.customCardPoolCheckList : roomSettings.systemCardPoolCheckList),
    ];
    applyCustomCardPoolSelection();
  };

  const applyCustomCardPoolSelection = () => {
    if (!customCardPoolActive.value) return;
    roomSettings.gamebp = false;
    roomSettings.matchbp = false;
    roomSettings.use_ai = false;
    roomSettings.ai_preference = {};
  };

  const setOnlinePoolMd5 = (md5: string | null) => {
    onlineCustomPoolStore.selectPool(md5);
    if (md5) {
      customCardPoolStore.selectSlot(null);
    }
    roomSettings.custom_card_pool_enabled = md5 !== null;
    applyCustomCardPoolSelection();
    saveRoomSettings();
  };

  const getStartGameCustomPoolData = () => {
    if (isOnlinePoolActive.value) {
      return { custom_pool_md5: onlineCustomPoolStore.selectedMd5 };
    }
    if (isLocalPoolActive.value) {
      return { custom_card_pool_compressed: compressedCustomCardPool() };
    }
    return {};
  };

  const customCardPoolSpells = () =>
    customCardPoolActive.value ? customCardPoolStore.selectedSpells(roomSettings.type === BingoType.BP) : [];

  const compressedCustomCardPool = () => {
    const json = JSON.stringify(customCardPoolSpells());
    const compressed = pako.deflate(json);
    let binary = "";
    for (let i = 0; i < compressed.byteLength; i++) {
      binary += String.fromCharCode(compressed[i]);
    }
    return btoa(binary);
  };

  const aiPracticeAvailableForSettings = () => {
    if (!practiceMode.value) return false;
    if (!Config.spellListWithTimer.includes(roomSettings.spell_version)) return false;
    if (roomSettings.type === BingoType.BP) return false;
    if (roomSettings.dual_board > 0) return false;
    if (roomSettings.type === BingoType.STANDARD) {
      return roomSettings.board_size === 5 && roomSettings.blind_setting <= 1;
    }
    return roomSettings.type === BingoType.LINK;
  };

  const checkAIPracticeEnabled = () => {
    if(customCardPoolActive.value || !aiPracticeAvailableForSettings()){
      roomSettings.use_ai = false;
    }
  }

  //服务端房间设置
  const roomConfig = reactive({
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
    custom_level_count: [2, 6, 12, 4, 1, 1, 0, 4, 1, 1, 5],
    board_size: 5,
    extra_line_count: 2,
    hidden_select_threshold_a: 5,
    hidden_select_threshold_b: 5,
    link_level_coefficient: 15,
    link_fastest_coefficient: 0,
    link_connectivity: 8,
    link_disabled_idx: [] as number[],
    link_start_a: 0,
    link_end_a: 24,
    link_start_b: 4,
    link_end_b: 20,
    custom_card_pool_enabled: false,
    pick_guarantee_count: 0,
    capture_standard: 1,
    copy_board: false,
  });

  const getRoomConfig = () => {
    return ws.send(WebSocketActionType.GET_ROOM_CONFIG, { rid: roomId.value }).then((data) => {
      applyRoomConfig(data, true);
    });
  };
  watch(roomId, (id) => {
    if (id) getRoomConfig();
  });

  const normalizeRoomSettingsForGameType = () => {
    applyCustomCardPoolSelection();
    if (roomSettings.type === BingoType.LINK) {
      roomSettings.dual_board = 0;
      roomSettings.blind_setting = 1;
    }
    if (roomSettings.type === BingoType.BP && roomSettings.board_size !== 5) {
      roomSettings.board_size = 5;
    }
    checkAIPracticeEnabled();
  };

  const applyRoomConfig = (data: any, full = false, syncLocalSettings = false) => {
    if (full && data.board_size === undefined) data.board_size = 5;
    for (const i in data) {
      roomConfig[i] = data[i];
      if (syncLocalSettings) {
        if (i === "board_size") roomSettings.board_size = data[i];
        if (i === "type") roomSettings.type = data[i];
        if (i === "blind_setting") roomSettings.blind_setting = data[i];
        if (i === "dual_board") roomSettings.dual_board = data[i];
        if (i === "spell_version") roomSettings.spell_version = data[i];
        if (i === "use_ai") roomSettings.use_ai = data[i];
        if (i === "capture_standard") roomSettings.capture_standard = data[i];
        if (i === "copy_board") roomSettings.copy_board = data[i];
      }
      if (roomData.hasOwnProperty(i)) {
        roomData[i] = data[i];
      }
    }
    if (syncLocalSettings) normalizeRoomSettingsForGameType();
  };

  const updateRoomConfig = (
    key?: "type" | "game_time" | "countdown" | "games" | "ranks" | "need_win" | "difficulty" | "cd_time"
      | "cd_modifier_a" | "cd_modifier_b"
      | "blind_setting" | "spell_version" | "dual_board" | "portal_count" | "blind_reveal_level" | "diff_level"
      | "use_ai" | "ai_strategy_level" | "ai_style" | "ai_base_power" | "ai_experience" | "ai_temperature"
      | "game_weight" | "ai_preference" | "custom_level_count"
      | "board_size" | "extra_line_count" | "hidden_select_threshold_a" | "hidden_select_threshold_b"
      | "link_level_coefficient" | "link_fastest_coefficient" | "link_connectivity"
      | "link_disabled_idx" | "link_start_a" | "link_end_a" | "link_start_b" | "link_end_b"
      | "custom_card_pool_enabled" | "custom_card_pool" | "pick_guarantee_count"
      | "capture_standard" | "copy_board",
  ) => {
    normalizeRoomSettingsForGameType();
    syncActiveCardPoolGameSelection();
    applyCustomCardPoolSelection();
    normalizeLinkSettings();
    const maxPickGuarantee = Math.floor((roomSettings.board_size * roomSettings.board_size * 20) / 100);
    if (roomSettings.pick_guarantee_count > maxPickGuarantee) {
      roomSettings.pick_guarantee_count = maxPickGuarantee;
    }
    saveRoomSettings();
    const allParams = {
      rid: roomId.value,
      type: roomSettings.type,
      game_time: activeGameTime(),
      countdown: activeCountdown(),
      games: roomSettings.checkList,
      ranks: roomSettings.rankList,
      need_win: (roomSettings.format + 1) / 2,
      difficulty: roomSettings.difficulty,
      cd_time: roomSettings.cdTime,
      cd_modifier_a: roomSettings.cdModifierA,
      cd_modifier_b: roomSettings.cdModifierB,
      blind_setting : roomSettings.blind_setting,
      spell_version : roomSettings.spell_version,
      dual_board: roomSettings.dual_board,
      portal_count: activePortalCount(),
      blind_reveal_level: roomSettings.blind_reveal_level,
      diff_level: roomSettings.diff_level,
      use_ai: roomSettings.use_ai,
      ai_strategy_level: roomSettings.ai_strategy_level,
      ai_style: roomSettings.ai_style,
      ai_base_power: roomSettings.ai_base_power,
      ai_experience: roomSettings.ai_experience,
      ai_temperature: roomSettings.ai_temperature,
      game_weight: roomSettings.game_weight,
      ai_preference: roomSettings.ai_preference,
      custom_level_count: activeCustomLevelCount(),
      board_size: roomSettings.board_size,
      extra_line_count: activeExtraLineCount(),
      hidden_select_threshold_a: activeHiddenThresholdA(),
      hidden_select_threshold_b: activeHiddenThresholdB(),
      link_level_coefficient: roomSettings.link_level_coefficient,
      link_fastest_coefficient: roomSettings.link_fastest_coefficient,
      link_connectivity: roomSettings.link_connectivity,
      link_disabled_idx: roomSettings.link_disabled_idx,
      link_start_a: roomSettings.link_start_a,
      link_end_a: roomSettings.link_end_a,
      link_start_b: roomSettings.link_start_b,
      link_end_b: roomSettings.link_end_b,
      custom_card_pool_enabled: customCardPoolActive.value,
      pick_guarantee_count: roomSettings.pick_guarantee_count,
      capture_standard: roomSettings.capture_standard,
      copy_board: roomSettings.copy_board,
    };
    const params: any = {};
    if (key) {
      params.rid = allParams.rid;
      params[key] = allParams[key];
      if(key === "type"){
        params.type = allParams.type
        params.game_time = allParams.game_time
        params.countdown = allParams.countdown
        params.games = allParams.games
        params.ranks = allParams.ranks
        params.extra_line_count = allParams.extra_line_count
        params.dual_board = allParams.dual_board
        params.blind_setting = allParams.blind_setting
        params.board_size = allParams.board_size
        params.use_ai = allParams.use_ai
        params.custom_card_pool_enabled = allParams.custom_card_pool_enabled
        params.pick_guarantee_count = allParams.pick_guarantee_count
      }else if(key === "board_size"){
        params.board_size = allParams.board_size
        params.extra_line_count = allParams.extra_line_count
        params.use_ai = allParams.use_ai
        params.pick_guarantee_count = allParams.pick_guarantee_count
      }else{
        params[key] = allParams[key];
      }
    }
    const payload = key ? params : allParams;
    return ws.send(WebSocketActionType.UPDATE_ROOM_CONFIG, payload)
      .then((data) => {
        applyRoomConfig(payload, false, true);
        return data;
      })
      .catch((e) => {
        getRoomConfig().catch(() => {});
        throw e;
      });
  };
  ws.on<{ name: string; position: number }>(WebSocketPushActionType.PUSH_UPDATE_ROOM_CONFIG, (data) => {
    applyRoomConfig(data, true, roomData.host === localStore.username || (!roomData.host && roomData.names[0] === localStore.username));
  });

  //房间数据
  const roomData = reactive({
    rid: "", // 房间名
    type: BingoType.STANDARD, // 1-标准赛
    host: "", // 房主的名字；无导播房为空字符串
    names: ["", ""], // 过渡字段：A 队第一人 / B 队第一人
    change_card_count: [0, 0], // 过渡字段：A/B 队共享换卡次数
    started: false,
    score: [0, 0], // 系列赛比分 A/B
    watchers: [] as string[],
    last_winner: -1, // 上一场获胜队伍，0或1，-1表示没有上一场
    players_online: {} as { [name: string]: boolean },
    teams: [] as RoomTeamInfo[],
    practice: false,
    roster_locked: false,
  });
  const setRoomData = (data) => {
    if (data.room_config) {
      applyRoomConfig(data.room_config, true);
    }
    for (const i in data) {
      if (i === "ban_pick") {
        for (const j in data["ban_pick"]) {
          banPick[j] = data["ban_pick"][j];
        }
      } else if (i === "room_config") {
        continue;
      } else {
        roomData[i] = data[i];
      }
    }
    if (Array.isArray(data.teams)) {
      roomData.teams = data.teams;
      roomData.names = [data.teams[0]?.members?.[0]?.name || "", data.teams[1]?.members?.[0]?.name || ""];
      roomData.change_card_count = [
        data.teams[0]?.change_card_count ?? 0,
        data.teams[1]?.change_card_count ?? 0,
      ];
    }
    if (data.practice !== undefined) roomData.practice = !!data.practice;
    if (data.roster_locked !== undefined) roomData.roster_locked = !!data.roster_locked;
    if (data.room_config && (roomData.host === localStore.username || (!roomData.host && roomData.names[0] === localStore.username))) {
      applyRoomConfig(data.room_config, true, true);
    }
  };
  const createRoom = (rid: string, soloMode: boolean, practiceRoom: boolean) => {
    normalizeRoomSettingsForGameType();
    syncActiveCardPoolGameSelection();
    applyCustomCardPoolSelection();
    return ws
      .send(WebSocketActionType.CREATE_ROOM, {
        room_config: {
          rid,
          type: roomSettings.type,
          game_time: activeGameTime(),
          countdown: activeCountdown(),
          games: roomSettings.checkList,
          ranks: roomSettings.rankList,
          need_win: (roomSettings.format + 1) / 2,
          difficulty: roomSettings.difficulty,
          cd_time: roomSettings.cdTime,
          cd_modifier_a: roomSettings.cdModifierA,
          cd_modifier_b: roomSettings.cdModifierB,
          blind_setting: roomSettings.blind_setting,
          spell_version: roomSettings.spell_version,
          dual_board: roomSettings.dual_board,
          portal_count: activePortalCount(),
          blind_reveal_level: roomSettings.blind_reveal_level,
          diff_level: roomSettings.diff_level,
          use_ai: roomSettings.use_ai,
          ai_strategy_level: roomSettings.ai_strategy_level,
          ai_style: roomSettings.ai_style,
          ai_base_power: roomSettings.ai_base_power,
          ai_experience: roomSettings.ai_experience,
          ai_temperature: roomSettings.ai_temperature,
          game_weight: roomSettings.game_weight,
          ai_preference: roomSettings.ai_preference,
          custom_level_count: activeCustomLevelCount(),
          board_size: roomSettings.board_size,
          extra_line_count: activeExtraLineCount(),
          hidden_select_threshold_a: activeHiddenThresholdA(),
          hidden_select_threshold_b: activeHiddenThresholdB(),
          link_level_coefficient: roomSettings.link_level_coefficient,
          link_fastest_coefficient: roomSettings.link_fastest_coefficient,
          link_connectivity: roomSettings.link_connectivity,
          link_disabled_idx: roomSettings.link_disabled_idx,
          link_start_a: roomSettings.link_start_a,
          link_end_a: roomSettings.link_end_a,
          link_start_b: roomSettings.link_start_b,
          link_end_b: roomSettings.link_end_b,
          custom_card_pool_enabled: customCardPoolActive.value,
          pick_guarantee_count: roomSettings.pick_guarantee_count,
          capture_standard: roomSettings.capture_standard,
          copy_board: roomSettings.copy_board,
          practice: practiceRoom,
        },
        solo: soloMode || practiceRoom,
        practice: practiceRoom,
      })
      .then((data) => {
        roomId.value = rid;
        if (data.room_config) {
          applyRoomConfig(data.room_config, true, true);
        }
        setRoomData(data);
      })
      .catch(() => {});
  };
  const resetRoomData = () => {
    roomId.value = "";
    roomData.rid = "";
    roomData.type = BingoType.STANDARD;
    roomData.host = "";
    roomData.names = ["", ""];
    roomData.change_card_count = [0, 0];
    roomData.started = false;
    roomData.score = [0, 0];
    roomData.watchers = [] as string[];
    roomData.last_winner = -1;
    roomData.players_online = {};
    roomData.teams = [];
    roomData.practice = false;
    roomData.roster_locked = false;
  };
  const getRoomData = () => {
    return ws
      .send(WebSocketActionType.GET_ROOM, { rid: roomId.value })
      .then((data) => {
        if (data) {
          setRoomData(data);
        }
      })
      .catch(() => {});
  };
  watch(roomId, (id) => {
    if (id) {
      getRoomData();
    }
  });

  const joinRoom = (rid: string) => {
    return ws
      .send(WebSocketActionType.JOIN_ROOM, { rid })
      .then((data) => {
        roomId.value = rid;
        setRoomData(data);
      })
      .catch(() => {});
  };
  // 阵容变更统一由 push_roster_update 全量自愈
  ws.on(WebSocketPushActionType.PUSH_ROSTER_UPDATE, (data: any) => {
    if (!data) return;
    roomData.teams = data.teams || [];
    roomData.watchers = data.watchers || [];
    roomData.started = !!data.started;
    roomData.roster_locked = !!data.roster_locked;
    roomData.practice = !!data.practice;
    roomData.host = data.host || "";
    roomData.names = [data.teams?.[0]?.members?.[0]?.name || "", data.teams?.[1]?.members?.[0]?.name || ""];
    roomData.score = [data.teams?.[0]?.score ?? 0, data.teams?.[1]?.score ?? 0];
    roomData.change_card_count = [
      data.teams?.[0]?.change_card_count ?? 0,
      data.teams?.[1]?.change_card_count ?? 0,
    ];
    roomData.players_online = Object.fromEntries(
      roomData.teams.flatMap((team) => team.members.map((m) => [m.name, m.online]))
    );
  });

  const leaveRoom = () => {
    return ws
      .send(WebSocketActionType.LEAVE_ROOM)
      .then(() => {
        resetRoomData();
      })
      .catch((e) => {});
  };
  ws.on<{ name: string }>(WebSocketPushActionType.PUSH_LEAVE_ROOM, (data) => {
    // 其他人离开时由紧随其后的 push_roster_update 全量修正
    if (data!.name === localStore.username) {
      resetRoomData();
    }
  });

  const resetRoom = () => {
    return ws.send(WebSocketActionType.RESET_ROOM);
  };
  ws.on(WebSocketPushActionType.PUSH_RESET_ROOM, () => {
    getRoomData();
    resetBanPick();
  });

  const standUp = (name?: string) => {
    return ws.send(WebSocketActionType.STAND_UP, name ? { name } : null);
  };

  const sitDown = (name?: string, team?: number) => {
    const payload: any = {};
    if (name) payload.name = name;
    if (team !== undefined) payload.team = team;
    return ws.send(WebSocketActionType.SIT_DOWN, Object.keys(payload).length ? payload : null);
  };

  const switchTeam = (to: number, name?: string) => {
    const payload: any = { to };
    if (name) payload.name = name;
    return ws.send(WebSocketActionType.SWITCH_TEAM, payload);
  };

  const toggleCaptain = (name?: string) => {
    return ws.send(WebSocketActionType.TOGGLE_CAPTAIN, name ? { name } : {});
  };

  const updateChangeCardCount = (team: number, count: number) => {
    return ws.send(WebSocketActionType.UPDATE_CHANGE_CARD_COUNT, { team, count });
  };
  ws.on(WebSocketPushActionType.PUSH_UPDATE_CHANGE_CARD_COUNT, ({ team, count }) => {
    if (team !== 0 && team !== 1) return;
    if (!roomData.teams[team]) return;
    roomData.teams[team].change_card_count = count;
    roomData.change_card_count[team] = count;
  });

  ws.on<{ players_online: { [name: string]: boolean } }>(WebSocketPushActionType.PUSH_PLAYER_STATUS, (data) => {
    roomData.players_online = data!.players_online || {};
  });

  //赛前bp
  const banPick = reactive({
    who_first: 0, // 谁是第一个操作的，0-左边，1-右边
    phase: 0, // BP状态
    a_pick: [] as string[], // 左玩家保了哪些作品
    a_ban: [] as string[], // 左玩家ban了哪些作品
    b_pick: [] as string[], // 右玩家保了哪些作品
    b_ban: [] as string[], // 右玩家ban了哪些作品
    a_open_ex: 0, // 左玩家是否选EX难度
    b_open_ex: 0, // 右玩家是否选EX难度
    a_force_ban_ex: 0, // 左玩家的强制BanEX投票：0-未投，1-强制BanEX，-1-继续正常BP
    b_force_ban_ex: 0, // 右玩家的强制BanEX投票：同上
  });

  const bpStatus = computed(() => {
    if (!banPick.phase) return null;
    switch (banPick.phase) {
      case -1:
        return BpStatus.FORCE_BAN_EX;
      case 1:
      case 3:
        return banPick.who_first === 0 ? BpStatus.IS_A_PICK : BpStatus.IS_B_PICK;
      case 2:
      case 4:
        return banPick.who_first === 0 ? BpStatus.IS_B_PICK : BpStatus.IS_A_PICK;
      case 5:
      case 8:
      case 9:
        return banPick.who_first === 0 ? BpStatus.IS_A_BAN : BpStatus.IS_B_BAN;
      case 6:
      case 7:
      case 10:
        return banPick.who_first === 0 ? BpStatus.IS_B_BAN : BpStatus.IS_A_BAN;
      case 11:
        return BpStatus.SELECT_OPEN_EX;
      case 9999:
        return BpStatus.BP_FINISH;
      default:
        return null;
    }
  });

  const resetBanPick = () => {
    banPick.who_first = 0;
    banPick.phase = 0;
    banPick.a_pick = [];
    banPick.a_ban = [];
    banPick.b_pick = [];
    banPick.b_ban = [];
    banPick.a_open_ex = 0;
    banPick.b_open_ex = 0;
    banPick.a_force_ban_ex = 0;
    banPick.b_force_ban_ex = 0;
  };

  const startBanPick = () => {
    return ws.send(WebSocketActionType.START_BAN_PICK);
  };

  const banPickCard = (selection: string) => {
    return ws.send(WebSocketActionType.BAN_PICK, { selection });
  };
  ws.on(WebSocketPushActionType.PUSH_BAN_PICK, (data) => {
    for (const i in data) {
      banPick[i] = data[i];
    }
  });

  const getRoomList = () => {
    return ws.send(WebSocketActionType.GET_ROOM_LIST);
  };

  // 计算各选手的实际CD时间（毫秒）
  const actualCdTimeA = computed(() => {
    const baseCd = (roomConfig.cd_time || 0) * 1000;
    if (roomConfig.type === BingoType.LINK) return Math.max(1000, baseCd);
    const modifier = (roomConfig.cd_modifier_a || 0) * 1000;
    const actual = baseCd + modifier;
    // 最低1秒，最高为基础值的3倍
    return Math.max(1000, Math.min(actual, baseCd * 3));
  });

  const actualCdTimeB = computed(() => {
    const baseCd = (roomConfig.cd_time || 0) * 1000;
    if (roomConfig.type === BingoType.LINK) return Math.max(1000, baseCd);
    const modifier = (roomConfig.cd_modifier_b || 0) * 1000;
    const actual = baseCd + modifier;
    // 最低1秒，最高为基础值的3倍
    return Math.max(1000, Math.min(actual, baseCd * 3));
  });

  return {
    roomId,
    soloMode,
    practiceMode,
    remotePlayerStatuses,
    roomSettings,
    roomData,
    roomConfig,
    inRoom,
    isReplayActive,
    setReplayActive,
    inGame,
    isPlayer,
    isPlayerA,
    isPlayerB,
    isWatcher,
    isHost,
    myMember,
    myTeam,
    isCaptain,
    teamMembers,
    orderedMembers,
    isTeamEmpty,
    bothTeamsReady,
    rosterLocked,
    createRoom,
    applyRoomConfig,
    updateRoomConfig,
    loadRoomSettings,
    saveRoomSettings,
    joinRoom,
    leaveRoom,
    resetRoom,
    standUp,
    sitDown,
    switchTeam,
    toggleCaptain,
    updateChangeCardCount,
    banPick,
    inMatch,
    bpStatus,
    resetBanPick,
    startBanPick,
    banPickCard,
    getRoomList,
    actualCdTimeA,
    actualCdTimeB,
    defaultCustomCountsForBoard,
    activeCustomLevelCount,
    activeExtraLineCount,
    updateExtraLineCountCache,
    customCardPoolActive,
    isLocalPoolActive,
    isOnlinePoolActive,
    setCustomCardPoolEnabled,
    setOnlinePoolMd5,
    applyCustomCardPoolSelection,
    customCardPoolSpells,
    compressedCustomCardPool,
    getStartGameCustomPoolData,
  };
});
