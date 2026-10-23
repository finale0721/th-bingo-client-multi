import { defineStore } from "pinia";
import { reactive, ref, watch, computed } from "vue";
import { useRoomStore } from "./RoomStore";
import { useGameStore } from "./GameStore";
import { BingoType, Spell, SpellStatus, RoomConfig, EditorPreset } from "@/types";
import { local } from "@/utils/Storage";
import ws from "@/utils/webSocket/WebSocketBingo";
import { WebSocketActionType } from "@/utils/webSocket/types";
import { BoardSpec } from "@/utils/board";
import pako from "pako";
import { useCustomCardPoolStore } from "@/store/CustomCardPoolStore";

// 创建一个默认的空白Spell对象
const createBlankSpell = (): Spell => ({
  index: 0,
  game: "",
  name: "",
  rank: "",
  star: 1,
  desc: "",
  id: 0,
  fastest: 0,
  miss_time: 0,
  power_weight: 0,
  difficulty: 0,
  change_rate: 0,
  max_cap_rate: 0,
});

const VALID_BOARD_SIZES = [4, 5, 6];
const DEFAULT_CUSTOM_LEVEL_COUNT = [2, 6, 12, 4, 1, 1, 0, 4, 1, 1, 5];

interface CacheEntry {
  data: Spell[];
  timestamp: number;
}

const CACHE_DURATION = 3 * 60 * 60 * 1000; // 3 hours

export const useEditorStore = defineStore("editor", () => {
  const roomStore = useRoomStore();
  const gameStore = useGameStore();
  const customCardPoolStore = useCustomCardPoolStore();

  const boardSpec = computed(() => new BoardSpec(roomStore.roomConfig.board_size || 5));
  const boardArea = computed(() => boardSpec.value.area);

  // --- 基础状态 ---
  const isEditorMode = ref(false);
  const spells = ref<Spell[]>([]);
  const spells2 = ref<Spell[]>([]);
  const spellStatus = ref<SpellStatus[]>([]);
  // const currentBoard = ref(0); // 移除：统一使用 gameStore.currentBoard

  // 兼容 GameStore 接口的数据结构
  const bpGameData = reactive({ spell_failed_count_a: [], spell_failed_count_b: [] });
  const normalGameData = reactive({
    is_portal_a: [] as number[],
    is_portal_b: [] as number[],
    extra_lines: [] as number[][],
  });

  // --- 初始状态设定 ---
  const initialLeftTime = ref(1800); // 秒
  const initialCountDown = ref(120);
  const initialCdTimeA = ref(0);
  const initialCdTimeB = ref(0);

  // --- 交互状态 ---
  const selectedSpellIndex = ref(-1);
  const isEditorModalVisible = ref(false);
  const clipboard = ref<Partial<Spell> | null>(null);

  // --- 数据库与面板 ---
  const isDatabasePanelVisible = ref(false);
  const localSpellDatabase = ref<Spell[]>(local.get("custom_spell_database") || []);
  const serverSpellCache = ref<Map<number, CacheEntry>>(new Map());
  const isFetchingServerData = ref(false);

  // --- 弹窗控制 ---
  const isInitialStateModalVisible = ref(false);
  const isPresetManagerVisible = ref(false);

  // --- 预设与备份 ---
  const presets = ref<EditorPreset[]>(local.get("editor_presets") || []);
  // 用于退出编辑器时恢复 roomStore 的真实配置
  const originalRoomConfigBackup = ref<RoomConfig | null>(null);

  let autoSaveTimer: number | null = null;
  const presetManagerMode = ref<'manage' | 'select'>('manage');

  const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

  const isValidBoardSize = (value: unknown): value is number => {
    return typeof value === "number" && VALID_BOARD_SIZES.includes(value);
  };

  const inferBoardSize = (data: Partial<EditorPreset["data"]> | undefined): number => {
    const explicit = Number(data?.roomConfig?.board_size);
    if (isValidBoardSize(explicit)) return explicit;

    const candidateLengths = [
      data?.spells?.length,
      data?.spellStatus?.length,
      data?.isPortalA?.length,
      data?.spells2?.length,
      data?.isPortalB?.length,
    ];
    for (const length of candidateLengths) {
      if (!length) continue;
      const size = Math.sqrt(length);
      if (Number.isInteger(size) && isValidBoardSize(size)) return size;
    }
    return 5;
  };

  const resizeArray = <T>(source: T[] | undefined, size: number, fill: () => T): T[] => {
    const list = Array.isArray(source) ? source : [];
    if (list.length > size) return list.slice(0, size);
    if (list.length < size) return [...list, ...Array.from({ length: size - list.length }, fill)];
    return [...list];
  };

  const normalizeSpell = (spell: Partial<Spell> | undefined): Spell => ({
    ...createBlankSpell(),
    ...(spell || {}),
  });

  const defaultCustomCountsForBoard = (boardSize: number): number[] => {
    if (boardSize === 4) return [1, 4, 8, 2, 1, 1, 0, 3, 1, 1, 4];
    if (boardSize === 6) return [3, 8, 17, 6, 2, 1, 0, 5, 1, 1, 7];
    return [...DEFAULT_CUSTOM_LEVEL_COUNT];
  };

  const normalizeCustomLevelCount = (source: unknown, boardSize: number): number[] => {
    const area = boardSize * boardSize;
    const fallback = defaultCustomCountsForBoard(boardSize);
    const raw = Array.isArray(source) ? source : fallback;
    const counts = Array.from({ length: 11 }, (_, i) => {
      const value = Number(raw[i] ?? fallback[i] ?? 0);
      return Number.isFinite(value) ? Math.trunc(value) : fallback[i] || 0;
    });
    for (let i = 0; i < 5; i++) {
      counts[i] = Math.max(0, Math.min(area, counts[i]));
    }
    counts[5] = counts[5] ? 1 : 0;
    counts[6] = counts[6] ? 1 : 0;
    counts[7] = Math.max(0, Math.min(boardSize, counts[7]));
    counts[8] = Math.max(0, Math.min(boardSize, counts[8]));
    if (counts[5] && counts[7] + counts[8] !== boardSize) {
      counts[7] = Math.min(boardSize, counts[7]);
      counts[8] = boardSize - counts[7];
    }
    counts[9] = counts[9] ? 1 : 0;
    counts[10] = Math.max(0, Math.min(area, counts[10]));
    return counts;
  };

  const normalizeExtraLines = (source: unknown, boardSize: number): number[][] => {
    const area = boardSize * boardSize;
    if (!Array.isArray(source)) return [];
    return source
      .filter((line): line is unknown[] => Array.isArray(line))
      .map((line) => {
        const unique: number[] = [];
        line.forEach((cell) => {
          const index = Number(cell);
          if (Number.isInteger(index) && index >= 0 && index < area && !unique.includes(index)) {
            unique.push(index);
          }
        });
        return unique;
      })
      .filter((line) => line.length >= 4);
  };

  const defaultHiddenThreshold = (boardSize: number): number => {
    if (boardSize === 4) return 3;
    if (boardSize === 6) return 7;
    return 5;
  };

  const normalizeRoomConfig = (source: Partial<RoomConfig> | undefined, boardSize: number): RoomConfig => {
    const base = deepClone(roomStore.roomConfig);
    const merged = {
      ...base,
      ...(source || {}),
    } as unknown as RoomConfig;
    merged.type = BingoType.STANDARD;
    merged.board_size = boardSize;
    (merged as any).portal_count = Math.max(0, Math.min(boardSize * boardSize, Number(merged.portal_count ?? base.portal_count ?? 0)));
    (merged as any).extra_line_count = boardSize === 6 ? Math.max(0, Number(merged.extra_line_count ?? 0)) : 0;
    merged.hidden_select_threshold_a = Number(merged.hidden_select_threshold_a || defaultHiddenThreshold(boardSize));
    merged.hidden_select_threshold_b = Number(merged.hidden_select_threshold_b || defaultHiddenThreshold(boardSize));
    merged.game_weight = merged.game_weight || {};
    merged.ai_preference = merged.ai_preference || {};
    merged.custom_level_count = normalizeCustomLevelCount(merged.custom_level_count, boardSize);
    return merged;
  };

  const normalizePresetData = (data: Partial<EditorPreset["data"]> | undefined): EditorPreset["data"] => {
    const boardSize = inferBoardSize(data);
    const area = boardSize * boardSize;
    const roomConfig = normalizeRoomConfig(data?.roomConfig, boardSize);
    const normalizedSpells2 = resizeArray(data?.spells2, area, () => createBlankSpell()).map(normalizeSpell);
    if (normalizedSpells2.some((spell) => spell.name || spell.game || spell.rank)) {
      roomConfig.dual_board = Math.max(1, roomConfig.dual_board || 0) as any;
    }
    return {
      spells: resizeArray(data?.spells, area, () => createBlankSpell()).map(normalizeSpell),
      spells2: normalizedSpells2,
      spellStatus: resizeArray(data?.spellStatus, area, () => SpellStatus.NONE),
      roomConfig,
      initialLeftTime: Number.isFinite(Number(data?.initialLeftTime)) ? Number(data?.initialLeftTime) : roomConfig.game_time * 60,
      initialCountDown: Number.isFinite(Number(data?.initialCountDown)) ? Number(data?.initialCountDown) : 0,
      initialCdTimeA: Number.isFinite(Number(data?.initialCdTimeA)) ? Number(data?.initialCdTimeA) : 0,
      initialCdTimeB: Number.isFinite(Number(data?.initialCdTimeB)) ? Number(data?.initialCdTimeB) : 0,
      isPortalA: resizeArray(data?.isPortalA, area, () => 0).map((value) => value ? 1 : 0),
      isPortalB: resizeArray(data?.isPortalB, area, () => 0).map((value) => value ? 1 : 0),
    };
  };

  const normalizePreset = (preset: Partial<EditorPreset>): EditorPreset => ({
    id: Number(preset.id ?? 0),
    note: String(preset.note ?? "新预设"),
    timestamp: Number(preset.timestamp ?? Date.now()),
    data: normalizePresetData(preset.data),
  });

  const persistPresets = () => {
    local.set("editor_presets", presets.value.map((preset) => normalizePreset(preset)));
  };

  presets.value = presets.value.map((preset) => normalizePreset(preset));
  persistPresets();

  const openPresetManager = (mode: 'manage' | 'select' = 'manage') => {
    presetManagerMode.value = mode;
    isPresetManagerVisible.value = true;
  };

  // --- 监听双盘面设置变化 ---
  watch(
    () => roomStore.roomConfig.dual_board,
    (newVal) => {
      if (!isEditorMode.value) return;

      if (newVal > 0) {
        if (spells2.value.length === 0) {
          spells2.value = Array.from({ length: boardArea.value }, () => createBlankSpell());
          if (normalGameData.is_portal_b.length === 0) {
            normalGameData.is_portal_b = Array(boardArea.value).fill(0);
          }
        }
      } else {
        // 关闭双盘面：切回盘面0
        // 关键修改：不清除 spells2 和 portal 数据，仅切换显示
        gameStore.currentBoard = 0;
      }
    }
  );

  // --- 核心逻辑 ---

  // 自动存档相关常量
  const AUTO_SAVE_START_ID = 100; // 101-110 对应 id 100-109
  const AUTO_SAVE_COUNT = 10;
  const AUTO_SAVE_INTERVAL = 180000; // 180秒

  const enterEditorMode = () => {
    if (roomStore.roomData.type !== BingoType.STANDARD || roomStore.roomConfig.type !== BingoType.STANDARD) {
      return;
    }

    originalRoomConfigBackup.value = JSON.parse(JSON.stringify(roomStore.roomConfig));

    // 加载最新的自动存档（从101-110中找最新的）
    const autoSaveSlots = presets.value.filter(p => 
      p.id >= AUTO_SAVE_START_ID && p.id < AUTO_SAVE_START_ID + AUTO_SAVE_COUNT
    );
    
    if (autoSaveSlots.length > 0) {
      // 找到时间戳最新的自动存档
      const latestAutoSave = autoSaveSlots.reduce((latest, current) => {
        return current.timestamp > latest.timestamp ? current : latest;
      });
      loadPresetData(latestAutoSave);
    } else {
      resetToBlank();
    }

    selectedSpellIndex.value = -1;
    isEditorMode.value = true;
    gameStore.currentBoard = 0;

    // 启动自动保存 (30秒)
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    autoSaveTimer = window.setInterval(() => {
      saveAutoSave();
    }, AUTO_SAVE_INTERVAL);
  };

  const exitEditorMode = () => {
    // 停止自动保存
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer);
      autoSaveTimer = null;
    }
    // 退出时立即保存一次
    saveAutoSave();

    if (originalRoomConfigBackup.value) {
      Object.assign(roomStore.roomConfig, originalRoomConfigBackup.value);
      originalRoomConfigBackup.value = null;
    }

    spells.value = [];
    spells2.value = [];
    spellStatus.value = [];
    isEditorMode.value = false;

    isDatabasePanelVisible.value = false;
    isInitialStateModalVisible.value = false;
    isPresetManagerVisible.value = false;
    isEditorModalVisible.value = false;
    gameStore.currentBoard = 0;
  };

  const resetToBlank = () => {
    const area = boardArea.value;
    spells.value = Array.from({ length: area }, () => createBlankSpell());
    spellStatus.value = Array.from({ length: area }, () => SpellStatus.NONE);

    initialLeftTime.value = roomStore.roomConfig.game_time * 60;
    initialCountDown.value = 0;
    initialCdTimeA.value = 0;
    initialCdTimeB.value = 0;
    normalGameData.is_portal_a = Array(area).fill(0);

    spells2.value = Array.from({ length: area }, () => createBlankSpell());
    normalGameData.is_portal_b = Array(area).fill(0);
    normalGameData.extra_lines = [];
  };

  const resizeList = <T>(list: T[], size: number, fill: () => T) => {
    if (list.length > size) return list.slice(0, size);
    if (list.length < size) return [...list, ...Array.from({ length: size - list.length }, fill)];
    return list;
  };

  const resizeBoardData = (area = boardArea.value) => {
    spells.value = resizeList(spells.value, area, createBlankSpell);
    spells2.value = resizeList(spells2.value, area, createBlankSpell);
    spellStatus.value = resizeList(spellStatus.value, area, () => SpellStatus.NONE);
    normalGameData.is_portal_a = resizeList(normalGameData.is_portal_a, area, () => 0);
    normalGameData.is_portal_b = resizeList(normalGameData.is_portal_b, area, () => 0);
    normalGameData.extra_lines = normalizeExtraLines(normalGameData.extra_lines, boardSpec.value.size);
    if (selectedSpellIndex.value >= area) {
      selectedSpellIndex.value = -1;
      isEditorModalVisible.value = false;
    }
  };

  const clearAllSpells = () => {
    const area = boardArea.value;
    if (roomStore.roomConfig.dual_board > 0) {
      if (gameStore.currentBoard === 0) {
        spells.value = Array.from({ length: area }, () => createBlankSpell());
        normalGameData.is_portal_a = Array(area).fill(0);
      } else {
        spells2.value = Array.from({ length: area }, () => createBlankSpell());
        normalGameData.is_portal_b = Array(area).fill(0);
      }
    } else {
      spells.value = Array.from({ length: area }, () => createBlankSpell());
      spells2.value = Array.from({ length: area }, () => createBlankSpell());
      spellStatus.value = Array.from({ length: area }, () => SpellStatus.NONE);
      normalGameData.is_portal_a = Array(area).fill(0);
      normalGameData.is_portal_b = Array(area).fill(0);
    }
  };

  const shuffleSpells = () => {
    resizeBoardData();
    const currentBoard = gameStore.currentBoard;
    const targetSpells = currentBoard === 0 ? spells.value : spells2.value;
    const targetPortals = currentBoard === 0 ? normalGameData.is_portal_a : normalGameData.is_portal_b;
    const bs = boardSpec.value;
    const size = bs.size;
    const area = bs.area;

    interface CellInfo {
      spell: Spell;
      status: SpellStatus;
      isPortal: number;
      star: number;
    }

    const nonEmptyCells: CellInfo[] = [];
    for (let i = 0; i < area; i++) {
      const spell = targetSpells[i];
      if (spell.name || spell.game || spell.rank) {
        nonEmptyCells.push({
          spell: { ...spell },
          status: spellStatus.value[i],
          isPortal: targetPortals[i],
          star: spell.star || 0
        });
      }
    }

    // Fisher-Yates shuffle helper
    const shuffle = <T>(arr: T[]): T[] => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    // Generate high-level positions: one per row/col, center always high
    // Mirrors server's SpellFactory.highLevelPositions
    const generateHighLevelPositions = (): number[] => {
      const perm = Array.from({ length: size }, (_, i) => i);
      const shuffled = shuffle(perm);

      if (size % 2 === 1) {
        const mid = Math.floor(size / 2);
        const centerCol = mid;
        const currentColAtMid = shuffled[mid];
        const indexOfCenterCol = shuffled.indexOf(centerCol);
        shuffled[mid] = centerCol;
        shuffled[indexOfCenterCol] = currentColAtMid;
      } else {
        const mid1 = size / 2 - 1;
        const mid2 = size / 2;
        if (shuffled[mid1] !== mid1 && shuffled[mid1] !== mid2) {
          const target = (shuffled[mid2] === mid1 || shuffled[mid2] === mid2) ? shuffled[mid2] : mid1;
          const idx = shuffled.indexOf(target);
          const tmp = shuffled[mid1];
          shuffled[mid1] = target;
          shuffled[idx] = tmp;
        }
        if (shuffled[mid2] !== mid1 && shuffled[mid2] !== mid2) {
          const otherCenterCol = shuffled[mid1] === mid1 ? mid2 : mid1;
          const idx = shuffled.indexOf(otherCenterCol);
          const tmp = shuffled[mid2];
          shuffled[mid2] = otherCenterCol;
          shuffled[idx] = tmp;
        }
      }

      return Array.from({ length: size }, (_, row) => bs.index(row, shuffled[row]));
    };

    const highRatedCells = nonEmptyCells.filter(cell => cell.star >= 4);

    // If not enough high-rated cells for structured placement, just shuffle all
    if (highRatedCells.length < size) {
      const shuffled = shuffle(nonEmptyCells);

      for (let i = 0; i < area; i++) {
        targetSpells[i] = createBlankSpell();
        targetPortals[i] = 0;
        spellStatus.value[i] = SpellStatus.NONE;
      }

      shuffled.forEach((cell, idx) => {
        targetSpells[idx] = cell.spell;
        targetPortals[idx] = cell.isPortal;
        spellStatus.value[idx] = cell.status;
      });

      return { success: true, message: '操作成功' };
    }

    // Enough high-rated cells: place them at high-level positions
    const selectedHigh = shuffle(highRatedCells).slice(0, size);
    const positions = generateHighLevelPositions();
    const positionsSet = new Set(positions);

    const remainingCells = shuffle(
      nonEmptyCells.filter(cell => !selectedHigh.includes(cell))
    );

    // Clear current board
    for (let i = 0; i < area; i++) {
      targetSpells[i] = createBlankSpell();
      targetPortals[i] = 0;
      spellStatus.value[i] = SpellStatus.NONE;
    }

    // Place high-rated cells at designated positions
    selectedHigh.forEach((cell, idx) => {
      const pos = positions[idx];
      targetSpells[pos] = cell.spell;
      targetPortals[pos] = cell.isPortal;
      spellStatus.value[pos] = cell.status;
    });

    // Place remaining cells in remaining positions
    let remainingIdx = 0;
    for (let i = 0; i < area && remainingIdx < remainingCells.length; i++) {
      if (!positionsSet.has(i)) {
        const cell = remainingCells[remainingIdx++];
        targetSpells[i] = cell.spell;
        targetPortals[i] = cell.isPortal;
        spellStatus.value[i] = cell.status;
      }
    }

    return { success: true, message: '操作成功' };
  };

  // --- 预设管理逻辑 ---

  const savePreset = (id: number, note: string) => {
    const presetData = normalizePreset({
      id,
      note,
      timestamp: Date.now(),
      data: {
        spells: deepClone(spells.value),
        spells2: deepClone(spells2.value),
        spellStatus: [...spellStatus.value],
        roomConfig: JSON.parse(JSON.stringify(roomStore.roomConfig)), // 直接保存当前 roomStore 的配置
        initialLeftTime: initialLeftTime.value,
        initialCountDown: initialCountDown.value,
        initialCdTimeA: initialCdTimeA.value,
        initialCdTimeB: initialCdTimeB.value,
        isPortalA: [...normalGameData.is_portal_a],
        isPortalB: [...normalGameData.is_portal_b],
      }
    });

    const index = presets.value.findIndex(p => p.id === id);
    if (index > -1) {
      presets.value[index] = presetData;
    } else {
      presets.value.push(presetData);
    }
    persistPresets();
  };

  const loadPreset = (id: number) => {
    const preset = presets.value.find(p => p.id === id);
    if (preset) {
      loadPresetData(preset);
    }
  };

  const loadPresetData = (preset: EditorPreset) => {
    const normalized = normalizePreset(preset);
    const d = normalized.data;
    spells.value = deepClone(d.spells);
    spells2.value = deepClone(d.spells2);
    spellStatus.value = [...d.spellStatus];

    // 恢复房间设置
    Object.assign(roomStore.roomConfig, deepClone(d.roomConfig));

    initialLeftTime.value = d.initialLeftTime;
    initialCountDown.value = d.initialCountDown;
    initialCdTimeA.value = d.initialCdTimeA;
    initialCdTimeB.value = d.initialCdTimeB;
    normalGameData.is_portal_a = [...d.isPortalA];
    normalGameData.is_portal_b = [...d.isPortalB];
    normalGameData.extra_lines = [];

    // 确保数据结构完整
    if (spells2.value.length === 0) {
      spells2.value = Array.from({ length: boardArea.value }, () => createBlankSpell());
    }
    if (normalGameData.is_portal_b.length === 0) {
      normalGameData.is_portal_b = Array(boardArea.value).fill(0);
    }
  };

  const deletePreset = (id: number) => {
    const index = presets.value.findIndex(p => p.id === id);
    if (index > -1) {
      presets.value.splice(index, 1);
      persistPresets();
    }
  };

  // 自动存档保存逻辑：轮询保存到101-110
  let lastAutoSaveId = AUTO_SAVE_START_ID;
  const saveAutoSave = () => {
    // 找到当前要保存的自动存档位置
    const targetId = lastAutoSaveId;
    
    // 保存预设
    const presetData = normalizePreset({
      id: targetId,
      note: `自动存档 #${targetId - AUTO_SAVE_START_ID + 101}`,
      timestamp: Date.now(),
      data: {
        spells: deepClone(spells.value),
        spells2: deepClone(spells2.value),
        spellStatus: [...spellStatus.value],
        roomConfig: deepClone(roomStore.roomConfig) as unknown as RoomConfig,
        initialLeftTime: initialLeftTime.value,
        initialCountDown: initialCountDown.value,
        initialCdTimeA: initialCdTimeA.value,
        initialCdTimeB: initialCdTimeB.value,
        isPortalA: [...normalGameData.is_portal_a],
        isPortalB: [...normalGameData.is_portal_b],
      }
    });

    const index = presets.value.findIndex(p => p.id === targetId);
    if (index > -1) {
      presets.value[index] = presetData;
    } else {
      presets.value.push(presetData);
    }
    persistPresets();

    // 更新下一个保存位置
    lastAutoSaveId++;
    if (lastAutoSaveId >= AUTO_SAVE_START_ID + AUTO_SAVE_COUNT) {
      lastAutoSaveId = AUTO_SAVE_START_ID;
    }
  };

  const exportPresets = (ids: number[]) => {
    const exportData = presets.value.filter(p => ids.includes(p.id)).map((preset) => normalizePreset(preset));
    const cleanData = exportData.map(p => {
      const { id, ...rest } = p;
      return rest;
    });
    const json = JSON.stringify(cleanData);
    const compressed = pako.deflate(json);
    let binary = '';
    const len = compressed.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(compressed[i]);
    }
    return btoa(binary);
  };

  const importPresets = (code: string, pageStartId: number = -1) => {
    try {
      const binary = atob(code);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const json = pako.inflate(bytes, { to: 'string' });
      const importedData: Omit<EditorPreset, 'id'>[] = JSON.parse(json);

      importedData.forEach((p, index) => {
        let targetId: number;
        if (pageStartId > -1) {
          targetId = pageStartId + index;
          if (targetId > 99) return;
        } else {
          return;
        }

        const newPreset = normalizePreset({
          ...p,
          id: targetId
        });

        const existingIdx = presets.value.findIndex(existing => existing.id === targetId);
        if (existingIdx > -1) {
          presets.value[existingIdx] = newPreset;
        } else {
          presets.value.push(newPreset);
        }
      });

      persistPresets();
      return true;
    } catch (e) {
      console.error("Import failed", e);
      return false;
    }
  };

  // 从指定页开始，顺序寻找空栏位导入预设
  const importPresetsToEmptySlots = (code: string, startPage: number) => {
    const result = {
      success: false,
      message: '',
      importedCount: 0,
      skippedCount: 0
    };

    try {
      const binary = atob(code);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const json = pako.inflate(bytes, { to: 'string' });
      const importedData: Omit<EditorPreset, 'id'>[] = JSON.parse(json);

      // 从起始页开始收集所有空栏位（排除自动存档区域 100-109）
      const emptySlots: number[] = [];
      for (let page = startPage; page <= 10; page++) {
        const pageStartId = (page - 1) * 10;
        for (let i = 0; i < 10; i++) {
          const slotId = pageStartId + i;
          if (slotId >= 100) break; // 跳过自动存档区域
          if (!presets.value.some(p => p.id === slotId)) {
            emptySlots.push(slotId);
          }
        }
      }

      let importedCount = 0;
      importedData.forEach((p, index) => {
        if (index < emptySlots.length) {
          const targetId = emptySlots[index];
          const newPreset = normalizePreset({
            ...p,
            id: targetId
          });
          presets.value.push(newPreset);
          importedCount++;
        }
      });

      persistPresets();

      result.importedCount = importedCount;
      result.skippedCount = importedData.length - importedCount;
      
      if (importedCount === 0) {
        result.success = false;
        result.message = '没有足够的空栏位，导入失败';
      } else if (result.skippedCount > 0) {
        result.success = true;
        result.message = `成功导入 ${importedCount} 个预设，${result.skippedCount} 个预设因栏位不足未导入`;
      } else {
        result.success = true;
        result.message = `成功导入全部 ${importedCount} 个预设`;
      }

      return result;
    } catch (e) {
      console.error("Import failed", e);
      result.success = false;
      result.message = '导入失败，代码格式错误';
      return result;
    }
  };

  // 导入单个预设到指定栏位
  const importSinglePreset = (code: string, targetId: number) => {
    const result = {
      success: false,
      message: '',
      warning: false
    };

    try {
      const binary = atob(code);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const json = pako.inflate(bytes, { to: 'string' });
      const importedData: Omit<EditorPreset, 'id'>[] = JSON.parse(json);

      if (importedData.length === 0) {
        result.success = false;
        result.message = '导入代码中没有预设数据';
        return result;
      }

      // 如果导入代码中有多个预设，选择时间戳最新的一个
      let selectedPreset = importedData[0];
      if (importedData.length > 1) {
        selectedPreset = importedData.reduce((latest, current) => {
          return (current.timestamp || 0) > (latest.timestamp || 0) ? current : latest;
        });
        result.warning = true;
      }

      const newPreset = normalizePreset({
        ...selectedPreset,
        id: targetId
      });

      const existingIdx = presets.value.findIndex(existing => existing.id === targetId);
      if (existingIdx > -1) {
        presets.value[existingIdx] = newPreset;
      } else {
        presets.value.push(newPreset);
      }

      persistPresets();

      result.success = true;
      if (result.warning) {
        result.message = `导入成功（从 ${importedData.length} 个预设中选择了最新的）`;
      } else {
        result.message = '导入成功';
      }

      return result;
    } catch (e) {
      console.error("Single import failed", e);
      result.success = false;
      result.message = '导入失败，代码格式错误';
      return result;
    }
  };

  const importReplay = (replayCode: string) => {
    try {
      const validBase64Chars = replayCode.match(/[A-Za-z0-9+/=]/g);
      if (!validBase64Chars) throw new Error("Invalid code");
      const cleanBase64 = validBase64Chars.join("");
      const binaryString = atob(cleanBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const jsonString = pako.inflate(bytes, { to: "string" });
      const payload = JSON.parse(jsonString);
      const data = payload.data || payload;
      const replayType = Number(data.roomConfig?.type ?? BingoType.STANDARD);
      if (replayType !== BingoType.STANDARD) {
        throw new Error("Only standard replay data can be imported into editor");
      }
      const normalized = normalizePresetData({
        spells: data.spells,
        spells2: data.spells2,
        spellStatus: data.initStatus || data.spellStatus,
        roomConfig: {
          ...(data.roomConfig || {}),
          extra_line_count: data.roomConfig?.extra_line_count ?? data.normalData?.extra_lines?.length ?? 0,
        },
        initialLeftTime: data.roomConfig?.game_time ? data.roomConfig.game_time * 60 : undefined,
        initialCountDown: data.roomConfig?.countdown ?? 0,
        initialCdTimeA: 0,
        initialCdTimeB: 0,
        isPortalA: data.normalData?.is_portal_a,
        isPortalB: data.normalData?.is_portal_b,
      });

      spells.value = deepClone(normalized.spells);
      spells2.value = deepClone(normalized.spells2);
      spellStatus.value = [...normalized.spellStatus];
      Object.assign(roomStore.roomConfig, deepClone(normalized.roomConfig));
      initialLeftTime.value = normalized.initialLeftTime;
      initialCountDown.value = normalized.initialCountDown;
      initialCdTimeA.value = normalized.initialCdTimeA;
      initialCdTimeB.value = normalized.initialCdTimeB;
      normalGameData.is_portal_a = [...normalized.isPortalA];
      normalGameData.is_portal_b = [...normalized.isPortalB];
      normalGameData.extra_lines = [];

      return true;
    } catch (e) {
      console.error("Replay import failed", e);
      return false;
    }
  };

  // --- 单元格操作 (使用 gameStore.currentBoard) ---
  const selectSpell = (index: number) => {
    if (selectedSpellIndex.value === index) {
      isEditorModalVisible.value = true;
    } else {
      selectedSpellIndex.value = index;
    }
  };

  const updateSpell = (payload: { index: number; spellData: Partial<Spell> }) => {
    // 使用 gameStore.currentBoard 决定目标数组
    const targetSpells = gameStore.currentBoard === 0 ? spells.value : spells2.value;
    Object.assign(targetSpells[payload.index], payload.spellData);
  };

  const updateSpellStatus = (payload: { index: number; status: SpellStatus }) => {
    spellStatus.value[payload.index] = payload.status;
  };

  const updatePortalStatus = (payload: { index: number; isPortal: boolean }) => {
    // 使用 gameStore.currentBoard 决定目标数组
    const targetPortals = gameStore.currentBoard === 0 ? normalGameData.is_portal_a : normalGameData.is_portal_b;
    targetPortals[payload.index] = payload.isPortal ? 1 : 0;
  };

  const clearSpell = (index: number) => {
    const blankSpell = createBlankSpell();
    updateSpell({ index, spellData: blankSpell });
    updateSpellStatus({ index, status: SpellStatus.NONE });
    updatePortalStatus({ index, isPortal: false });
  };

  const copySpell = (index: number) => {
    if (index === -1) return;
    const targetSpells = gameStore.currentBoard === 0 ? spells.value : spells2.value;
    const sourceSpell = targetSpells[index];
    clipboard.value = {
      name: sourceSpell.name,
      game: sourceSpell.game,
      rank: sourceSpell.rank,
      star: sourceSpell.star,
      desc: sourceSpell.desc,
    };
  };

  const pasteSpell = (index: number) => {
    if (index === -1 || !clipboard.value) return;
    updateSpell({ index, spellData: clipboard.value });
  };

  const closeModal = () => { isEditorModalVisible.value = false; };
  const toggleEditorMode = () => { isEditorMode.value ? exitEditorMode() : enterEditorMode(); };
  const toggleDatabasePanel = () => { isDatabasePanelVisible.value = !isDatabasePanelVisible.value; };

  const saveToLocalDatabase = (spell: Spell) => {
    const exists = localSpellDatabase.value.some(s => s.name === spell.name && s.game === spell.game && s.rank === spell.rank);
    if (!exists) {
      const newSpell = createBlankSpell();
      Object.assign(newSpell, { name: spell.name, game: spell.game, rank: spell.rank, star: spell.star, desc: spell.desc });
      localSpellDatabase.value.push(newSpell);
      local.set("custom_spell_database", localSpellDatabase.value);
      return true;
    }
    return false;
  };

  const deleteFromLocalDatabase = (spell: Spell) => {
    const index = localSpellDatabase.value.indexOf(spell);
    if (index > -1) {
      localSpellDatabase.value.splice(index, 1);
      local.set("custom_spell_database", localSpellDatabase.value);
    }
  };

  const fetchServerSpells = async (version: number) => {
    const now = Date.now();
    const cacheEntry = serverSpellCache.value.get(version);
    if (cacheEntry && (now - cacheEntry.timestamp < CACHE_DURATION)) return;
    isFetchingServerData.value = true;
    try {
      const base64Data: string = await ws.send(WebSocketActionType.GET_XLSX_DATA, { id: version });
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      const jsonString = pako.inflate(bytes, { to: "string" });
      const rawData = JSON.parse(jsonString);
      const flattenedSpells: Spell[] = [];
      Object.values(rawData).forEach((isExMap: any) => {
        Object.values(isExMap).forEach((gameMap: any) => {
          Object.values(gameMap).forEach((spellList: any) => {
            if (Array.isArray(spellList)) flattenedSpells.push(...spellList);
          });
        });
      });
      serverSpellCache.value.set(version, { data: flattenedSpells, timestamp: now });
    } catch (e) {
      console.error("Failed to fetch spell data", e);
    } finally {
      isFetchingServerData.value = false;
    }
  };

  const applySpellFromDatabase = (spell: Spell) => {
    if (selectedSpellIndex.value === -1) return;
    updateSpell({ index: selectedSpellIndex.value, spellData: { name: spell.name, game: spell.game, rank: spell.rank, star: spell.star, desc: spell.desc } });
  };

  const updateLocalDatabaseSpell = (index: number, spell: Spell) => {
    if (index >= 0 && index < localSpellDatabase.value.length) {
      localSpellDatabase.value[index] = { ...localSpellDatabase.value[index], ...spell };
      local.set("custom_spell_database", localSpellDatabase.value);
    }
  };

  const customPoolSpellDatabase = computed(() => customCardPoolStore.selectedSpells(false));

  const getNormalizedPreset = (preset: EditorPreset) => normalizePreset(preset);

  watch(() => isEditorMode.value, (value) => {
    presetManagerMode.value = value ? 'manage' : 'select'
  });

  watch(boardArea, (area) => {
    if (isEditorMode.value) {
      resizeBoardData(area);
    }
  });

  watch(
    () => roomStore.roomData.type,
    (type) => {
      if (isEditorMode.value && type !== BingoType.STANDARD) {
        exitEditorMode();
      }
    }
  );

  return {
    isEditorMode,
    spells,
    spells2,
    spellStatus,
    boardSpec,
    boardArea,
    normalGameData,
    bpGameData,
    enterEditorMode,
    exitEditorMode,
    toggleEditorMode,
    selectedSpellIndex,
    isEditorModalVisible,
    selectSpell,
    updateSpell,
    updateSpellStatus,
    updatePortalStatus,
    clearSpell,
    clearAllSpells,
    shuffleSpells,
    copySpell,
    pasteSpell,
    closeModal,
    isDatabasePanelVisible,
    localSpellDatabase,
    customPoolSpellDatabase,
    serverSpellCache,
    isFetchingServerData,
    toggleDatabasePanel,
    saveToLocalDatabase,
    deleteFromLocalDatabase,
    fetchServerSpells,
    applySpellFromDatabase,
    updateLocalDatabaseSpell,
    initialLeftTime,
    initialCountDown,
    initialCdTimeA,
    initialCdTimeB,
    isInitialStateModalVisible,
    isPresetManagerVisible,
    presets,
    savePreset,
    loadPreset,
    deletePreset,
    exportPresets,
    importPresets,
    importPresetsToEmptySlots,
    importSinglePreset,
    importReplay,
    getNormalizedPreset,
    presetManagerMode,
    openPresetManager,
  };
});
