<template>
  <section v-if="logData" class="admin-replay-player" :style="layoutVars">
    <div class="room-title preview-title">
      <div class="player-A">{{ playerNames[0] || "玩家A" }}</div>
      <div class="scoreboard">
        <strong class="score-value">{{ currentScore[0] }} : {{ currentScore[1] }}</strong>
        <div class="score-subline">
          <el-tag size="small" effect="plain">{{ playbackStateLabel }}</el-tag>
          <span>{{ formatClock(currentTime) }} / {{ formatClock(totalTime) }}</span>
        </div>
      </div>
      <div class="player-B">{{ playerNames[1] || "玩家B" }}</div>
    </div>

    <div class="replay-stage">
      <aside class="player-side">
        <div class="side-card side-card-a">
          <span class="card-label">A方状态</span>
          <strong>{{ playerNames[0] || "玩家A" }}</strong>
          <small>当前盘面 {{ boardLabel(playerBoards[0]) }}</small>
          <small>当前局分 {{ currentScore[0] }}</small>
        </div>
        <div class="side-card">
          <span class="card-label">播放信息</span>
          <strong>{{ actionCount }}</strong>
          <small>总动作数</small>
          <small>速度 {{ speed }}x</small>
        </div>
      </aside>

      <div class="center-stage">
        <div class="control-bar">
          <div class="control-actions">
            <el-button size="small" type="primary" @click="togglePlay" :disabled="!actionCount">
              {{ isPlaying ? "暂停" : "播放" }}
            </el-button>
            <el-button size="small" @click="stepToPreviousAction" :disabled="!actionCount">上一步</el-button>
            <el-button size="small" @click="stepToNextAction" :disabled="!actionCount">下一步</el-button>
            <el-button size="small" @click="resetReplay">重置</el-button>
          </div>
          <div class="control-side">
            <el-select v-model="speed" size="small" class="speed-select">
              <el-option v-for="item in speedOptions" :key="item" :label="`${item}x`" :value="item" />
            </el-select>
            <div v-if="isDualBoard" class="board-switch">
              <el-button size="small" :type="viewBoard === 0 ? 'primary' : 'default'" @click="viewBoard = 0"
                >盘面 A</el-button
              >
              <el-button size="small" :type="viewBoard === 1 ? 'primary' : 'default'" @click="viewBoard = 1"
                >盘面 B</el-button
              >
            </div>
          </div>
        </div>

        <div class="stage-meta">
          <span>{{ isDualBoard ? `当前查看盘面 ${boardLabel(viewBoard)}` : "当前盘面" }}</span>
          <span v-if="currentAction">
            {{ currentAction.playerName || "-" }} / {{ getActionTypeLabel(currentAction.actionType) }} /
            {{ currentAction.spellName || "-" }}
          </span>
          <span v-else>尚未开始回放</span>
        </div>

        <div class="board-shell">
          <div class="bingo-wrap" :style="{ aspectRatio: '1 / 1' }">
            <div class="bingo-items">
              <div
                v-for="(spell, index) in displayedSpells"
                :key="`${viewBoard}-${index}-${spell?.name || 'spell'}`"
                class="spell-card"
                :style="{ width: spellCardSizePercent, height: spellCardSizePercent }"
              >
                <spell-card-cell
                  :name="spell?.name || ''"
                  :desc="spell?.desc || ''"
                  :level="spellLevel(spell)"
                  :status="simulation.spellStatus[index] ?? SpellStatus.NONE"
                  :disabled="true"
                  :selected="false"
                  :spell-index="index"
                  :is-portal-a="isPortalA(index)"
                  :is-portal-b="isPortalB(index)"
                  :is-a-current-board="viewBoard === 0"
                  :is-b-current-board="viewBoard === 1"
                  :preview-current-board="viewBoard"
                  :preview-dual-board="logData.roomConfig.dual_board || 0"
                  :preview-player-a-board="simulation.playerBoards[0]"
                  :preview-player-b-board="simulation.playerBoards[1]"
                  :preview-get-on-which-board="logData.normalData?.get_on_which_board || []"
                  :preview-viewer-is-player-a="false"
                  :preview-viewer-is-player-b="false"
                  :link-marker="linkMarker(index)"
                  :link-status-a="simulation.linkData?.status_a?.[index] || 0"
                  :link-status-b="simulation.linkData?.status_b?.[index] || 0"
                  :link-skipped-a="simulation.linkData?.skipped_idx_a?.includes(index) || false"
                  :link-skipped-b="simulation.linkData?.skipped_idx_b?.includes(index) || false"
                />
                <span v-if="currentAction?.spellIndex === index" class="focus-marker">Now</span>
              </div>
            </div>
            <svg
              v-if="linkLinesForDisplay.length > 0"
              class="link-lines-overlay"
              :viewBox="`0 0 ${replayBoardSize} ${replayBoardSize}`"
              preserveAspectRatio="none"
            >
              <polyline
                v-for="line in linkLinesForDisplay"
                :key="line.key"
                :points="line.points"
                :stroke="line.color"
                stroke-width="7"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
                vector-effect="non-scaling-stroke"
                opacity="0.82"
              />
            </svg>
            <div v-if="isDualBoard" :class="viewBoard === 0 ? 'page' : 'page-reverse'"></div>
            <svg
              v-if="extraLinesForDisplay.length > 0"
              class="extra-lines-overlay"
              :viewBox="`0 0 ${replayBoardSize} ${replayBoardSize}`"
              preserveAspectRatio="none"
            >
              <polyline
                v-for="(line, index) in extraLinesForDisplay"
                :key="index"
                :points="line.points"
                :stroke="extraLineColor"
                stroke-width="6"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
                vector-effect="non-scaling-stroke"
                opacity="0.7"
              />
            </svg>
          </div>
        </div>

        <div class="timeline-wrap">
          <input
            class="timeline"
            type="range"
            :min="0"
            :max="totalTime"
            :step="100"
            :value="currentTime"
            @input="handleSliderInput"
          />
          <div class="timeline-meta">
            <span>已回放 {{ processedActionCount }} / {{ actionCount }}</span>
            <span v-if="isDualBoard"
              >A方盘面 {{ boardLabel(playerBoards[0]) }} · B方盘面 {{ boardLabel(playerBoards[1]) }}</span
            >
            <span>{{ formatClock(currentTime) }}</span>
          </div>
        </div>
      </div>

      <aside class="player-side">
        <div class="side-card side-card-b">
          <span class="card-label">B方状态</span>
          <strong>{{ playerNames[1] || "玩家B" }}</strong>
          <small>当前盘面 {{ boardLabel(playerBoards[1]) }}</small>
          <small>当前局分 {{ currentScore[1] }}</small>
        </div>
        <div class="side-card">
          <span class="card-label">回放定位</span>
          <strong>{{ playbackStateLabel }}</strong>
          <small>当前时间 {{ formatClock(currentTime) }}</small>
          <small>总时长 {{ formatClock(totalTime) }}</small>
        </div>
      </aside>
    </div>
  </section>
  <el-empty v-else description="当前记录没有可回放数据" />
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { BingoType, GameStatus, SpellStatus } from "@/types";
import type { LinkData, Spell } from "@/types";
import { ElButton, ElEmpty, ElOption, ElSelect, ElSlider, ElTag } from "element-plus";
import Replay, { type GameLogData, type PlayerAction } from "@/utils/Replay";
import SpellCardCell from "@/components/spell-card-cell.vue";
import { local } from "@/utils/Storage";

const props = defineProps<{
  gameLog: GameLogData | null;
}>();

const speedOptions = [1, 1.5, 2, 3, 5, 8, 15, 30];
const speed = ref(1);
const isPlaying = ref(false);
const currentTime = ref(0);
const viewBoard = ref(0);
const replayTimer = ref<number | null>(null);
const lastTickTime = ref(0);
const actionCursor = ref(0);
const palette = ref(readPaletteSettings());

const simulation = reactive({
  spellStatus: [] as number[],
  playerBoards: [0, 0] as [number, number],
  gameStatus: GameStatus.NOT_STARTED,
  currentAction: null as PlayerAction | null,
  currentScore: [0, 0] as [number, number],
  linkData: null as LinkData | null,
});

const logData = computed(() => {
  if (!props.gameLog) {
    return null;
  }
  return Replay.normalizeGameLog(props.gameLog);
});

const playerNames = computed<[string, string]>(() => {
  const players = logData.value?.players || [];
  return [players[0] || "", players[1] || ""];
});

const totalTime = computed(() => {
  const actions = replayActions.value;
  return actions.length ? actions[actions.length - 1].timestamp : 0;
});

const replayActions = computed(() =>
  (logData.value?.actions || [])
    .map((action, index) => ({ action, index }))
    .sort((a, b) => a.action.timestamp - b.action.timestamp || a.index - b.index)
    .map((item) => item.action)
);
const actionCount = computed(() => replayActions.value.length);
const isDualBoard = computed(() => (logData.value?.roomConfig.dual_board || 0) > 0 && !!logData.value?.spells2?.length);
const isLinkReplay = computed(() => logData.value?.roomConfig.type === BingoType.LINK);
const replayBoardSize = computed(() => logData.value?.roomConfig.board_size || 5);
const extraLineColor = computed(() => palette.value.extraLineColor || "#fbff00");
const spellCardSizePercent = computed(() => {
  const s = replayBoardSize.value;
  return `calc(100% / ${s} - 4px)`;
});
const currentAction = computed(() => simulation.currentAction);
const processedActionCount = computed(() => actionCursor.value);
const currentScore = computed(() => simulation.currentScore);
const playerBoards = computed(() => simulation.playerBoards);

const displayedSpells = computed(() => {
  if (!logData.value) {
    return [];
  }
  if (!isDualBoard.value || viewBoard.value === 0) {
    return logData.value.spells;
  }
  return logData.value.spells2 || logData.value.spells;
});

const extraLinesForDisplay = computed(() => {
  const lines = logData.value?.normalData?.extra_lines || [];
  const bs = replayBoardSize.value;
  return lines.map((line) => {
    const points = line
      .map((idx) => {
        const row = Math.floor(idx / bs);
        const col = idx % bs;
        return `${col + 0.5},${row + 0.5}`;
      })
      .join(" ");
    return { points };
  });
});

const linkRouteToPoints = (route: number[] | undefined) => {
  const bs = replayBoardSize.value;
  return (route || [])
    .map((idx) => {
      const row = Math.floor(idx / bs);
      const col = idx % bs;
      return `${col + 0.5},${row + 0.5}`;
    })
    .join(" ");
};

const linkLinesForDisplay = computed(() => {
  if (!isLinkReplay.value || !simulation.linkData) {
    return [];
  }
  const lines = [];
  if (simulation.linkData.link_idx_a.length > 0) {
    lines.push({ key: "link-a", points: linkRouteToPoints(simulation.linkData.link_idx_a), color: palette.value.linkPathColorA });
  }
  if (simulation.linkData.link_idx_b.length > 0) {
    lines.push({ key: "link-b", points: linkRouteToPoints(simulation.linkData.link_idx_b), color: palette.value.linkPathColorB });
  }
  return lines;
});

const playbackStateLabel = computed(() => {
  if (!logData.value || !actionCount.value) {
    return "无动作";
  }
  if (isPlaying.value) {
    return "播放中";
  }
  if (processedActionCount.value >= actionCount.value && currentTime.value >= totalTime.value) {
    return "已结束";
  }
  if (simulation.gameStatus === GameStatus.PAUSED) {
    return "已暂停";
  }
  if (processedActionCount.value === 0) {
    return "未开始";
  }
  return "已定位";
});

const layoutVars = computed(() => ({
  "--A-color": palette.value.aColor,
  "--B-color": palette.value.bColor,
  "--A-color-dark": getDarkColor(palette.value.aColor),
  "--B-color-dark": getDarkColor(palette.value.bColor),
  "--bg-color": palette.value.backgroundColor,
  "--bg-color-reverse": palette.value.backgroundColorReverse,
}));

function readPaletteSettings() {
  const settings = local.get("roomSettings") || {};
  return {
    aColor: settings.playerA?.color || "hsl(16, 100%, 50%)",
    bColor: settings.playerB?.color || "hsl(210, 100%, 56%)",
    backgroundColor: settings.backgroundColor || "hsl(58, 63%, 79%)",
    backgroundColorReverse: settings.backgroundColorReverse || "hsl(258, 100%, 77%)",
    extraLineColor: settings.extraLineColor || "#fbff00",
    linkPathColorA: settings.linkPathColorA || settings.playerA?.color || "hsl(16, 100%, 50%)",
    linkPathColorB: settings.linkPathColorB || settings.playerB?.color || "hsl(210, 100%, 56%)",
  };
}

function getDarkColor(color: string) {
  if (!color) {
    return "";
  }
  const arr = color.match(/\((.*),(.*)%,(.*)%(,(.*))?\)/);
  if (arr === null) {
    return color;
  }
  if (arr[5]) {
    return `hsla(${arr[1]},${arr[2]}%,${parseInt(arr[3], 10) - 20}%,${arr[5]})`;
  }
  return `hsl(${arr[1]},${arr[2]}%,${parseInt(arr[3], 10) - 20}%)`;
}

const handleStorageChange = () => {
  palette.value = readPaletteSettings();
};

const stopReplayTimer = () => {
  if (replayTimer.value !== null) {
    window.clearInterval(replayTimer.value);
    replayTimer.value = null;
  }
};

const getInitialPlayerBoards = (): [number, number] => {
  if (!logData.value?.normalData) {
    return [0, 0];
  }
  return [logData.value.normalData.which_board_a || 0, logData.value.normalData.which_board_b || 0];
};

const createBlankLinkData = (): LinkData => {
  const area = replayBoardSize.value * replayBoardSize.value;
  return {
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
  };
};

const cloneLinkData = (data: LinkData | null | undefined): LinkData | null => {
  if (!isLinkReplay.value) {
    return null;
  }
  const empty = createBlankLinkData();
  const source = data || empty;
  return {
    ...empty,
    ...source,
    link_idx_a: [...(source.link_idx_a || [])],
    link_idx_b: [...(source.link_idx_b || [])],
    status_a: [...(source.status_a || empty.status_a)],
    status_b: [...(source.status_b || empty.status_b)],
    skipped_idx_a: [...(source.skipped_idx_a || [])],
    skipped_idx_b: [...(source.skipped_idx_b || [])],
    disabled_idx: [...(source.disabled_idx || [])],
  };
};

const resetSimulation = () => {
  simulation.spellStatus = [...(logData.value?.initStatus || [])];
  simulation.playerBoards = getInitialPlayerBoards();
  simulation.gameStatus = actionCount.value ? GameStatus.STARTED : GameStatus.NOT_STARTED;
  simulation.currentAction = null;
  simulation.linkData = cloneLinkData(null);
  simulation.currentScore = [0, 0];
  actionCursor.value = 0;
  currentTime.value = 0;
  viewBoard.value = 0;
};

const boardLabel = (boardIndex: number) => (boardIndex === 1 ? "B" : "A");

const getActionTypeLabel = (actionType: string) => {
  if (actionType === "select") return "选择符卡";
  if (actionType === "finish") return "收取符卡";
  if (actionType === "contest_win") return "抢卡成功";
  if (actionType === "pause") return "暂停比赛";
  if (actionType === "resume") return "恢复比赛";
  if (actionType === "link_route") return "加入路线";
  if (actionType === "link_undo") return "撤回路线";
  if (actionType === "link_confirm_route") return "确认路线";
  if (actionType === "link_unconfirm_route") return "取消确认路线";
  if (actionType === "link_start_run") return "开始竞速";
  if (actionType === "link_next_card") return "选择下一张";
  if (actionType === "link_finish_card") return "收取符卡";
  if (actionType === "link_skip_card") return "跳过符卡";
  if (actionType === "link_undo_finish") return "撤销收取";
  if (actionType === "link_set_skip_used") return "调整跳过次数";
  if (actionType === "link_finish_run") return "结束竞速";
  if (actionType === "link_ai_speedrun") return "AI速通";
  if (actionType.startsWith("set-")) {
    const status = Number(actionType.split("-")[1] || 0);
    switch (status) {
      case SpellStatus.NONE:
        return "重置状态";
      case SpellStatus.A_SELECTED:
        return "设置为左侧已选";
      case SpellStatus.BOTH_SELECTED:
        return "设置为双方已选";
      case SpellStatus.B_SELECTED:
        return "设置为右侧已选";
      case SpellStatus.A_ATTAINED:
        return "设置为左侧收取";
      case SpellStatus.BOTH_ATTAINED:
        return "设置为双方收取";
      case SpellStatus.B_ATTAINED:
        return "设置为右侧收取";
      case SpellStatus.BANNED:
        return "设置为禁用";
      case SpellStatus.BOTH_HIDDEN:
        return "设置为双方隐藏";
      case SpellStatus.ONLY_REVEAL_GAME:
        return "设置为仅显示作品";
      case SpellStatus.ONLY_REVEAL_GAME_STAGE:
        return "设置为仅显示作品面";
      case SpellStatus.ONLY_REVEAL_STAR:
        return "设置为仅显示星级";
      default:
        return `设置状态 ${status}`;
    }
  }
  return actionType;
};

const spellLevel = (spell?: Spell) => {
  if (!spell) {
    return 0;
  }
  return logData.value?.roomConfig.type === BingoType.STANDARD ? spell.star : spell.star + 100;
};

const getPlayerIndex = (action: PlayerAction) => {
  return playerNames.value.indexOf(action.playerName) >= 0 ? playerNames.value.indexOf(action.playerName) : 0;
};

const getAttainBoard = (index: number, playerIndex: 0 | 1) => {
  const value = logData.value?.normalData?.get_on_which_board?.[index] || 0;
  if (playerIndex === 0) {
    if ((value & 0x01) === 0x01) return 0;
    if ((value & 0x02) === 0x02) return 1;
  } else {
    if ((value & 0x10) === 0x10) return 0;
    if ((value & 0x20) === 0x20) return 1;
  }
  return null;
};

const isPortalOnBoard = (boardIndex: number, spellIndex: number) => {
  const normalData = logData.value?.normalData;
  if (!normalData || !isDualBoard.value) {
    return false;
  }
  if (boardIndex === 0) {
    return (normalData.is_portal_a?.[spellIndex] || 0) > 0;
  }
  return (normalData.is_portal_b?.[spellIndex] || 0) > 0;
};

const isPortalA = (spellIndex: number) => isPortalOnBoard(0, spellIndex);
const isPortalB = (spellIndex: number) => isPortalOnBoard(1, spellIndex);

const linkMarker = (spellIndex: number) => {
  if (!isLinkReplay.value) {
    return "";
  }
  const linkData = simulation.linkData;
  const startA = linkData?.link_idx_a?.[0] ?? logData.value?.roomConfig.link_start_a;
  const startB = linkData?.link_idx_b?.[0] ?? logData.value?.roomConfig.link_start_b;
  const labels: string[] = [];
  if (spellIndex === startA) labels.push("A起");
  if (spellIndex === logData.value?.roomConfig.link_end_a) labels.push("A终");
  if (spellIndex === startB) labels.push("B起");
  if (spellIndex === logData.value?.roomConfig.link_end_b) labels.push("B终");
  return labels.join(" ");
};

const maybeSwitchBoard = (playerIndex: number, spellIndex: number) => {
  if (!isDualBoard.value || playerIndex < 0 || playerIndex > 1) {
    return;
  }
  const currentBoard = simulation.playerBoards[playerIndex];
  if (isPortalOnBoard(currentBoard, spellIndex)) {
    simulation.playerBoards[playerIndex] = currentBoard === 0 ? 1 : 0;
  }
};

const syncLinkSpellStatus = () => {
  if (!isLinkReplay.value || !simulation.linkData) {
    return;
  }
  const area = replayBoardSize.value * replayBoardSize.value;
  const status = Array(area).fill(SpellStatus.NONE);
  for (let i = 0; i < area; i += 1) {
    const a = simulation.linkData.status_a?.[i] || 0;
    const b = simulation.linkData.status_b?.[i] || 0;
    if (a === SpellStatus.A_ATTAINED && b === SpellStatus.B_ATTAINED) {
      status[i] = SpellStatus.BOTH_ATTAINED;
    } else if (a === SpellStatus.A_SELECTED && b === SpellStatus.B_SELECTED) {
      status[i] = SpellStatus.BOTH_SELECTED;
    } else if (a === SpellStatus.A_ATTAINED) {
      status[i] = SpellStatus.A_ATTAINED;
    } else if (b === SpellStatus.B_ATTAINED) {
      status[i] = SpellStatus.B_ATTAINED;
    } else if (a === SpellStatus.A_SELECTED) {
      status[i] = SpellStatus.A_SELECTED;
    } else if (b === SpellStatus.B_SELECTED) {
      status[i] = SpellStatus.B_SELECTED;
    }
  }
  simulation.spellStatus = status;
};

const applyAction = (action: PlayerAction) => {
  const actionType = action.actionType.split("-")[0];
  const spellIndex = action.spellIndex;
  const playerIndex = getPlayerIndex(action);

  if (isLinkReplay.value && action.linkData) {
    simulation.linkData = cloneLinkData(action.linkData);
    syncLinkSpellStatus();
    simulation.currentScore = [
      Math.floor(action.linkData.score_a || action.scoreNow?.[0] || 0),
      Math.floor(action.linkData.score_b || action.scoreNow?.[1] || 0),
    ];
    simulation.gameStatus = GameStatus.STARTED;
    simulation.currentAction = action;
    return;
  }

  if (Array.isArray(action.scoreNow) && action.scoreNow.length === 2) {
    simulation.currentScore = [action.scoreNow[0] || 0, action.scoreNow[1] || 0];
  }

  if (actionType === "select" && spellIndex >= 0) {
    if (playerIndex === 0) {
      simulation.spellStatus[spellIndex] =
        simulation.spellStatus[spellIndex] === SpellStatus.B_SELECTED
          ? SpellStatus.BOTH_SELECTED
          : SpellStatus.A_SELECTED;
    } else {
      simulation.spellStatus[spellIndex] =
        simulation.spellStatus[spellIndex] === SpellStatus.A_SELECTED
          ? SpellStatus.BOTH_SELECTED
          : SpellStatus.B_SELECTED;
    }
    simulation.gameStatus = GameStatus.STARTED;
  } else if ((actionType === "finish" || actionType === "contest_win") && spellIndex >= 0) {
    simulation.spellStatus[spellIndex] = playerIndex === 0 ? SpellStatus.A_ATTAINED : SpellStatus.B_ATTAINED;
    maybeSwitchBoard(playerIndex, spellIndex);
    simulation.gameStatus = GameStatus.STARTED;
  } else if (actionType === "pause") {
    simulation.gameStatus = GameStatus.PAUSED;
  } else if (actionType === "resume") {
    simulation.gameStatus = GameStatus.STARTED;
  } else if (actionType === "set" && spellIndex >= 0) {
    const nextStatus = Number(action.actionType.split("-")[1] || 0);
    simulation.spellStatus[spellIndex] = nextStatus;
    if (nextStatus === SpellStatus.A_ATTAINED) {
      maybeSwitchBoard(0, spellIndex);
    }
    if (nextStatus === SpellStatus.B_ATTAINED) {
      maybeSwitchBoard(1, spellIndex);
    }
  }

  if (
    isDualBoard.value &&
    spellIndex >= 0 &&
    (actionType === "finish" || actionType === "contest_win" || actionType === "set")
  ) {
    const aBoard = getAttainBoard(spellIndex, 0);
    const bBoard = getAttainBoard(spellIndex, 1);
    if (playerIndex === 0 && aBoard !== null) {
      viewBoard.value = aBoard;
    }
    if (playerIndex === 1 && bBoard !== null) {
      viewBoard.value = bBoard;
    }
  }

  simulation.currentAction = action;
};

const seekTo = (target: number) => {
  if (!logData.value) {
    return;
  }

  const normalizedTarget = Math.max(0, Math.min(target, totalTime.value));
  const shouldReset = normalizedTarget < currentTime.value || normalizedTarget === 0;
  if (shouldReset) {
    resetSimulation();
  }

  while (
    actionCursor.value < actionCount.value &&
    (replayActions.value[actionCursor.value]?.timestamp || 0) <= normalizedTarget
  ) {
    applyAction(replayActions.value[actionCursor.value]);
    actionCursor.value += 1;
  }

  currentTime.value = normalizedTarget;
  if (normalizedTarget >= totalTime.value && actionCount.value > 0) {
    simulation.gameStatus = GameStatus.ENDED;
  }
};

const startReplayTimer = () => {
  stopReplayTimer();
  lastTickTime.value = Date.now();
  replayTimer.value = window.setInterval(() => {
    if (!isPlaying.value) {
      return;
    }
    const now = Date.now();
    const delta = now - lastTickTime.value;
    lastTickTime.value = now;
    const nextTime = currentTime.value + delta * speed.value;
    seekTo(nextTime);
    if (nextTime >= totalTime.value) {
      isPlaying.value = false;
      stopReplayTimer();
    }
  }, 30);
};

const togglePlay = () => {
  if (!actionCount.value) {
    return;
  }
  if (isPlaying.value) {
    isPlaying.value = false;
    stopReplayTimer();
    return;
  }
  if (currentTime.value >= totalTime.value) {
    resetReplay();
  }
  isPlaying.value = true;
  startReplayTimer();
};

const resetReplay = () => {
  isPlaying.value = false;
  stopReplayTimer();
  resetSimulation();
};

const stepToPreviousAction = () => {
  if (!logData.value?.actions.length) {
    return;
  }
  const previousIndex = Math.max(0, actionCursor.value - 2);
  const timestamp = replayActions.value[previousIndex]?.timestamp || 0;
  isPlaying.value = false;
  stopReplayTimer();
  seekTo(timestamp);
};

const stepToNextAction = () => {
  if (!logData.value?.actions.length) {
    return;
  }
  const nextTimestamp = replayActions.value[actionCursor.value]?.timestamp ?? totalTime.value;
  isPlaying.value = false;
  stopReplayTimer();
  seekTo(nextTimestamp);
};

const handleSliderInput = (event: Event) => {
  const target = Number((event.target as HTMLInputElement).value || 0);
  isPlaying.value = false;
  stopReplayTimer();
  seekTo(target);
};

const formatClock = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

watch(
  () => props.gameLog,
  () => {
    isPlaying.value = false;
    stopReplayTimer();
    speed.value = 1;
    palette.value = readPaletteSettings();
    resetSimulation();
  },
  { immediate: true }
);

watch(speed, () => {
  if (isPlaying.value) {
    startReplayTimer();
  }
});

onMounted(() => {
  window.addEventListener("storage", handleStorageChange);
});

onBeforeUnmount(() => {
  stopReplayTimer();
  window.removeEventListener("storage", handleStorageChange);
});

defineExpose({
  seekTo,
  reset: resetReplay,
});
</script>

<style lang="scss" scoped>
.admin-replay-player {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preview-title {
  margin: 0;
}

.room-title {
  font-size: 28px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.room-title .player-A,
.room-title .player-B {
  width: 34%;
  min-height: 32px;
  display: flex;
  align-items: center;
}

.room-title .player-A {
  justify-content: flex-end;
  text-align: right;
  color: var(--A-color);
}

.room-title .player-B {
  justify-content: flex-start;
  text-align: left;
  color: var(--B-color);
}

.scoreboard {
  width: 32%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.score-value {
  font-size: 30px;
  line-height: 1;
  color: #10293a;
}

.score-subline {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
  color: #5a7280;
  font-size: 12px;
}

.replay-stage {
  display: grid;
  grid-template-columns: minmax(144px, 180px) minmax(0, 1fr) minmax(144px, 180px);
  gap: 16px;
  align-items: start;
}

.player-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.side-card {
  padding: 14px 12px;
  border-radius: 16px;
  border: 1px solid rgba(7, 34, 51, 0.12);
  background: rgba(255, 255, 255, 0.78);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.side-card strong {
  font-size: 18px;
  color: #10293a;
}

.side-card small,
.card-label {
  color: #5a7280;
}

.side-card-a strong {
  color: var(--A-color);
}

.side-card-b strong {
  color: var(--B-color);
}

.center-stage {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.board-shell {
  width: min(100%, 640px);
  margin: 0 auto;
}

.control-bar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.control-actions,
.control-side,
.board-switch {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.speed-select {
  width: 92px;
}

.stage-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(11, 57, 82, 0.05);
  color: #5a7280;
  font-size: 12px;
}

.bingo-wrap {
  width: 100%;
  height: auto;
  box-sizing: border-box;
  position: relative;
}

.bingo-items {
  width: 100%;
  height: 100%;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-content: space-between;
  border: 1px solid #000;
  border-radius: 4px;
  padding: 2px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.92);
}

.spell-card {
  position: relative;
  border: 1px solid #000;
  border-radius: 4px;
  width: 19.4%;
  height: 19.4%;
  overflow: hidden;
}

.focus-marker {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 3;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(255, 231, 155, 0.92);
  color: #553400;
  font-size: 11px;
  font-weight: 700;
  pointer-events: none;
}

.page,
.page-reverse {
  position: absolute;
  top: 4px;
  left: 4px;
  width: calc(100% - 8px);
  height: calc(100% - 8px);
  pointer-events: none;
}

.page {
  background: linear-gradient(90deg, transparent 95%, var(--bg-color)),
    linear-gradient(180deg, transparent 95%, var(--bg-color)), linear-gradient(270deg, transparent 95%, var(--bg-color)),
    linear-gradient(360deg, transparent 95%, var(--bg-color));
}

.page-reverse {
  background: linear-gradient(90deg, transparent 95%, var(--bg-color-reverse)),
    linear-gradient(180deg, transparent 95%, var(--bg-color-reverse)),
    linear-gradient(270deg, transparent 95%, var(--bg-color-reverse)),
    linear-gradient(360deg, transparent 95%, var(--bg-color-reverse));
}

.extra-lines-overlay,
.link-lines-overlay {
  position: absolute;
  top: 4px;
  left: 4px;
  width: calc(100% - 8px);
  height: calc(100% - 8px);
  pointer-events: none;
  z-index: 6;
}

.link-lines-overlay {
  z-index: 5;
}

.timeline-wrap {
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(10, 41, 60, 0.04);
}

.timeline {
  width: 100%;
}

.timeline-meta {
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  color: #5a7280;
  font-size: 12px;
}

@media (max-width: 1240px) {
  .replay-stage {
    grid-template-columns: 1fr;
  }

  .player-side {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .room-title {
    flex-direction: column;
    gap: 10px;
  }

  .room-title .player-A,
  .room-title .player-B,
  .scoreboard {
    width: 100%;
    justify-content: center;
    text-align: center;
  }

  .board-shell {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .player-side {
    grid-template-columns: 1fr;
  }
}
</style>
