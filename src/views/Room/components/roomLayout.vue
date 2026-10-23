<template>
  <div class="room">
    <div class="room-title" v-if="roomData.names">
      <div class="player-A">{{ roomData.names[0] }}</div>
      <div class="scoreboard">
        <div class="A-scoreboard">
          <template v-if="roomData.names[0]">
            <div
              :class="{ 'score-circle': true, 'scored-A': roomData.score[0] >= needWin - index }"
              v-for="(item, index) in needWinArr"
              :key="index"
            ></div>
          </template>
        </div>
        <div class="vs-text">VS</div>
        <div class="B-scoreboard">
          <template v-if="roomData.names[1]">
            <div
              :class="{ 'score-circle': true, 'scored-B': roomData.score[1] >= index + 1 }"
              v-for="(item, index) in needWinArr"
              :key="index"
            ></div
          ></template>
        </div>
      </div>
      <div class="player-B">{{ roomData.names[1] }}</div>
    </div>
    <div class="room-content">
      <el-row class="">
        <el-col :span="4">
          <div class="player-extra-info">
            <slot name="left"></slot>
          </div>
        </el-col>
        <el-col :span="16">
          <div class="bingo-wrap" :style="boardWrapStyle">
            <right-click-menu
              style="width: 100%; height: 100%; display: flex; justify-content: center; align-items: center"
              :menuData="contextMenuData"
              :disabled="!editorStore.isEditorMode && (!menu || menu.length === 0 || !inGame)"
              @click="onMenuClick"
            >
              <div class="bingo-inner-align">
                <div class="bingo-items" ref="bingoItemsRef" :style="{ width: boardInnerSize, height: boardInnerSize }">
                  <template v-if="displayedSpells.length > 0">
                    <div
                      class="spell-card"
                      v-for="(item, index) in displayedSpells"
                      :key="index"
                      :style="{ width: spellCardSizePercent, height: spellCardSizePercent }"
                    >
                      <spell-card-cell
                        :name="item.name"
                        :desc="item.desc"
                        :level="isBingoStandard ? item.star : item.star + 100"
                        :failCountA="dataSource.bpGameData?.spell_failed_count_a[index] || 0"
                        :failCountB="dataSource.bpGameData?.spell_failed_count_b[index] || 0"
                        @click="isEditorMode ? emits('editor-cell-click', index) : selectSpellCard(index)"
                        :selected="selectedSpellIndex === index"
                        :status="displayStatus(index)"
                        :link-status-a="linkStatusA(index)"
                        :link-status-b="linkStatusB(index)"
                        :link-skipped-a="linkSkippedA(index)"
                        :link-skipped-b="linkSkippedB(index)"
                        :index="index"
                        :link-marker="linkMarker(index)"
                        :isPortalA="
                          roomStore.roomConfig.dual_board > 0 && dataSource.normalGameData?.is_portal_a[index] > 0
                        "
                        :isPortalB="
                          roomStore.roomConfig.dual_board > 0 && dataSource.normalGameData?.is_portal_b[index] > 0
                        "
                        :isACurrentBoard="gameStore.currentBoard == 0"
                        :isBCurrentBoard="gameStore.currentBoard == 1"
                        :spellIndex="index"
                      ></spell-card-cell>
                    </div>
                  </template>
                  <!-- SVG overlay for extra lines — drawn above cells so always visible -->
                  <svg
                    v-if="extraLinesForDisplay.length > 0 || linkLinesForDisplay.length > 0"
                    class="extra-lines-overlay"
                    :viewBox="`0 0 ${boardSize} ${boardSize}`"
                    preserveAspectRatio="none"
                  >
                    <polyline
                      v-for="(line, li) in extraLinesForDisplay"
                      :key="li"
                      :points="line.points"
                      :stroke="extraLineColor"
                      stroke-width="6"
                      fill="none"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      vector-effect="non-scaling-stroke"
                      opacity="0.7"
                    />
                    <polyline
                      v-for="line in linkLinesForDisplay"
                      :key="line.key"
                      :points="line.points"
                      :stroke="line.color"
                      stroke-width="8"
                      fill="none"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      vector-effect="non-scaling-stroke"
                      opacity="0.72"
                    />
                  </svg>
                </div>
              </div>
            </right-click-menu>
            <game-alert ref="gameAlertRef" />
            <slot name="extra"></slot>
          </div>
        </el-col>
        <el-col :span="4">
          <div class="player-extra-info">
            <slot name="right"></slot>
          </div>
        </el-col>
      </el-row>
    </div>
    <div class="room-actions">
      <div class="widget-wrap">
        <slot name="widget"></slot>
      </div>
      <div class="bingo-buttons">
        <div class="sub-button">
          <slot name="button-left-2"></slot>
        </div>
        <div class="sub-button">
          <slot name="button-left-1"></slot>
        </div>
        <div class="main-button">
          <slot name="button-center"></slot>
        </div>
        <div class="sub-button">
          <slot name="button-right-1"></slot>
        </div>
        <div class="sub-button">
          <slot name="button-right-2"></slot>
        </div>
      </div>
    </div>
    <div class="audio">
      <bgm
        ref="spellCardGrabbedAudioRef"
        :src="require('@/assets/audio/spell_card_grabbed.mp3')"
        :muted="sfxMuted"
      ></bgm>
      <bgm ref="gamePointAudioRef" :src="require('@/assets/audio/game_point.wav')" :muted="sfxMuted"></bgm>
      <bgm ref="lineWarnAudioRef" :src="require('@/assets/audio/se_ufoalert.mp3')" :muted="sfxMuted"></bgm>
      <bgm ref="pauseAudioRef" :src="require('@/assets/audio/se_pause.mp3')" :muted="sfxMuted"></bgm>
      <bgm ref="startGameAudioRef" :src="require('@/assets/audio/start_game.mp3')" :muted="sfxMuted"></bgm>
      <bgm ref="captureCardAudioRef" :src="require('@/assets/audio/se_cardget.mp3')" :muted="sfxMuted"></bgm>
      <bgm ref="captureCardFailureAudioRef" :src="require('@/assets/audio/se_pldead00.mp3')" :muted="sfxMuted"></bgm>
      <bgm ref="winGameAudioRef" :src="require('@/assets/audio/se_extend.mp3')" :muted="sfxMuted"></bgm>
      <bgm ref="loseGameAudioRef" :src="require('@/assets/audio/se_fault.mp3')" :muted="sfxMuted"></bgm>
      <bgm
        ref="turn1CountdownAudioRef"
        src="http://link.hhtjim.com/163/22636828.mp3"
        :loop="true"
        :endTime="174"
        :volume="volume"
        :muted="muted"
      ></bgm>
      <bgm
        ref="turn2CountdownAudioRef"
        src="http://link.hhtjim.com/163/30854145.mp3"
        :loop="true"
        :endTime="242"
        :volume="volume"
        :muted="muted"
      ></bgm>
      <bgm
        ref="turn3CountdownAudioRef"
        src="http://link.hhtjim.com/163/22636827.mp3"
        :loop="true"
        :endTime="184"
        :volume="volume"
        :muted="muted"
      ></bgm>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, onMounted, onUnmounted, watch } from "vue";
import SpellCardCell from "@/components/spell-card-cell.vue";
import RightClickMenu from "@/components/right-click-menu.vue";
import GameAlert from "./gameAlert.vue";
import { ElRow, ElCol } from "element-plus";
import bgm from "@/components/bgm.vue";
import { useRoomStore } from "@/store/RoomStore";
import { useGameStore } from "@/store/GameStore";
import ws from "@/utils/webSocket/WebSocketBingo";
import { WebSocketPushActionType } from "@/utils/webSocket/types";
import { BingoType, GameStatus } from "@/types";
import type { Spell } from "@/types";
import { useEditorStore } from "@/store/EditorStore";
import { BoardSpec } from "@/utils/board";

const roomStore = useRoomStore();
const gameStore = useGameStore();
const editorStore = useEditorStore();

const dataSource = computed(() => {
  return editorStore.isEditorMode ? editorStore : gameStore;
});

const props = withDefaults(
  defineProps<{
    menu: { label: string; value: number; tag?: string }[];
    multiple?: boolean;
    isEditorMode?: boolean;
  }>(),
  {
    multiple: false,
    isEditorMode: false,
  }
);
const selectedSpellIndex = defineModel();
const emits = defineEmits(["update:modelValue", "editor-cell-click"]);

const volume = ref(0.3);
const needWinArr = computed(() => new Array(needWin.value));
const gameAlertRef = ref();
const spellCardGrabbedAudioRef = ref<InstanceType<typeof bgm>>();
const gamePointAudioRef = ref<InstanceType<typeof bgm>>();
const turn1CountdownAudioRef = ref<InstanceType<typeof bgm>>();
const turn2CountdownAudioRef = ref<InstanceType<typeof bgm>>();
const turn3CountdownAudioRef = ref<InstanceType<typeof bgm>>();
const lineWarnAudioRef = ref<InstanceType<typeof bgm>>();
const pauseAudioRef = ref<InstanceType<typeof bgm>>();
const startGameAudioRef = ref<InstanceType<typeof bgm>>();
const captureCardAudioRef = ref<InstanceType<typeof bgm>>();
const captureCardFailureAudioRef = ref<InstanceType<typeof bgm>>();
const winGameAudioRef = ref<InstanceType<typeof bgm>>();
const loseGameAudioRef = ref<InstanceType<typeof bgm>>();

const muted = computed(() => roomStore.roomSettings.bgmMuted);
const sfxMuted = computed(() => roomStore.roomSettings.sfxMuted);
const extraLineColor = computed(() => roomStore.roomSettings.extraLineColor || "#0ce739");
const roomData = computed(() => roomStore.roomData);
const isWatcher = computed(() => roomStore.isWatcher);
const isPlayerA = computed(() => roomStore.isPlayerA);
const isPlayerB = computed(() => roomStore.isPlayerB);
const inGame = computed(() => roomStore.inGame);
const needWin = computed(() => roomStore.roomConfig.need_win);
const isBingoStandard = computed(() => roomData.value.type === BingoType.STANDARD);
const isBingoLink = computed(() => roomData.value.type === BingoType.LINK);

const boardSizeFromSpells = computed(() => {
  const length = dataSource.value.spells?.length || 0;
  const size = Math.sqrt(length);
  return size === 4 || size === 5 || size === 6 ? size : 0;
});
const boardSize = computed(() => (inGame.value ? boardSizeFromSpells.value : 0) || roomStore.roomConfig.board_size || 5);
const boardInnerSize = computed(() => (boardSize.value === 4 ? "80%" : "100%"));
const boardWrapWidth = computed(() => (boardSize.value === 6 ? "752px" : "100%"));
const boardWrapHeight = computed(() => `${Math.max(boardSize.value, 5) * 100}px`);
const boardOverlayWidth = computed(() => {
  if (boardSize.value === 4) return "calc(80% - 8px)";
  if (boardSize.value === 6) return "744px";
  return "calc(100% - 8px)";
});
const boardOverlayHeight = computed(() => {
  if (boardSize.value === 4) return "392px";
  if (boardSize.value === 6) return "592px";
  return "calc(100% - 8px)";
});
const boardWrapStyle = computed(() => ({
  width: boardWrapWidth.value,
  height: boardWrapHeight.value,
  "--board-overlay-width": boardOverlayWidth.value,
  "--board-overlay-height": boardOverlayHeight.value,
}));
const spellCardSizePercent = computed(() => `calc(100% / ${boardSize.value} - 4px)`);
const boardArea = computed(() => boardSize.value * boardSize.value);
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
const displayedSpells = computed(() => {
  const source = gameStore.currentBoard == 0 ? dataSource.value.spells : dataSource.value.spells2;
  if (!source || source.length === 0) {
    return editorStore.isEditorMode ? Array.from({ length: boardArea.value }, createBlankSpell) : [];
  }
  if (source.length > boardArea.value) {
    return source.slice(0, boardArea.value);
  }
  if (source.length < boardArea.value) {
    return [...source, ...Array.from({ length: boardArea.value - source.length }, createBlankSpell)];
  }
  return source;
});
const extraLinesForDisplay = computed(() => {
  const lines = dataSource.value.normalGameData?.extra_lines;
  if (!lines || lines.length === 0) return [];
  const bs = boardSize.value;
  return lines.map((line: number[]) => {
    const points = line
      .map((idx: number) => {
        const r = Math.floor(idx / bs);
        const c = idx % bs;
        return `${c + 0.5},${r + 0.5}`;
      })
      .join(" ");
    return { points };
  });
});
const routeToPolyline = (route: number[]) => {
  const bs = boardSize.value;
  return (route || [])
    .map((idx: number) => {
      const r = Math.floor(idx / bs);
      const c = idx % bs;
      return `${c + 0.5},${r + 0.5}`;
    })
    .join(" ");
};
const linkLinesForDisplay = computed(() => {
  if (roomData.value.type !== BingoType.LINK) return [];
  const lines: { key: string; points: string; color: string }[] = [];
  const a = gameStore.linkGameData.link_idx_a || [];
  const b = gameStore.linkGameData.link_idx_b || [];
  if (a.length > 0) {
    lines.push({ key: "link-a", points: routeToPolyline(a), color: roomStore.roomSettings.linkPathColorA || roomStore.roomSettings.playerA.color });
  }
  if (b.length > 0) {
    lines.push({ key: "link-b", points: routeToPolyline(b), color: roomStore.roomSettings.linkPathColorB || roomStore.roomSettings.playerB.color });
  }
  return lines;
});
const BGMpaused = computed(
  () =>
    turn1CountdownAudioRef.value?.paused && turn2CountdownAudioRef.value?.paused && turn3CountdownAudioRef.value?.paused
);

const selectSpellCard = (index: number) => {
  if (props.isEditorMode) {
    // 在编辑器模式下，逻辑非常简单：直接更新 v-model
    selectedSpellIndex.value = index;
    return; // 结束函数，不执行下面的游戏逻辑
  }

  if (isWatcher.value) {
    return;
  }
  if (isBingoLink.value) {
    const takeover = gameStore.linkGameData.takeover_player_index;
    if (takeover >= 0) {
      if (takeover === 0 && isPlayerA.value) return;
      if (takeover === 1 && isPlayerB.value) return;
    }
    if (gameStore.linkGameData.route_confirmed_a && isPlayerA.value) return;
    if (gameStore.linkGameData.route_confirmed_b && isPlayerB.value) return;
    if (gameStore.linkGameData.event_a > 0 || gameStore.linkGameData.event_b > 0) return;
    selectedSpellIndex.value = index;
    gameStore.linkRoute(index).catch(() => {
      if (selectedSpellIndex.value === index) selectedSpellIndex.value = -1;
    });
    return;
  }
  if (selectedSpellIndex.value === index) {
    selectedSpellIndex.value = -1;
  } else {
    if (props.multiple) {
      if (gameStore.spellStatus[index] === 0 || canSelectBlindCard(gameStore.spellStatus[index]))
        selectedSpellIndex.value = index;
    } else {
      if (
        gameStore.spellStatus[index] === 0 ||
        (isPlayerB.value && gameStore.spellStatus[index] === 1) ||
        (isPlayerA.value && gameStore.spellStatus[index] === 3) ||
        canSelectBlindCard(gameStore.spellStatus[index])
      ) {
        selectedSpellIndex.value = index;
      }
    }
  }
};

const displayStatus = (index: number) => {
  if (!isBingoLink.value) return dataSource.value.spellStatus[index];
  const linkData = gameStore.linkGameData;
  if (linkData.disabled_idx?.includes(index)) return -1;
  const a = linkData.status_a?.[index] || 0;
  const b = linkData.status_b?.[index] || 0;
  if (a === 5 && b === 7) return 6;
  if (a === 1 && b === 3) return 2;
  return a || b || 0;
};
const linkStatusA = (index: number) => (isBingoLink.value ? gameStore.linkGameData.status_a?.[index] || 0 : 0);
const linkStatusB = (index: number) => (isBingoLink.value ? gameStore.linkGameData.status_b?.[index] || 0 : 0);
const linkSkippedA = (index: number) => isBingoLink.value && (gameStore.linkGameData.skipped_idx_a || []).includes(index);
const linkSkippedB = (index: number) => isBingoLink.value && (gameStore.linkGameData.skipped_idx_b || []).includes(index);
const linkMarker = (index: number) => {
  if (!isBingoLink.value) return "";
  const markers: string[] = [];
  const data = gameStore.linkGameData;
  const startA = data.link_idx_a?.[0] ?? roomStore.roomConfig.link_start_a;
  const startB = data.link_idx_b?.[0] ?? roomStore.roomConfig.link_start_b;
  const endA = roomStore.roomConfig.link_end_a;
  const endB = roomStore.roomConfig.link_end_b;
  if (index === startA) markers.push("A起");
  if (index === endA) markers.push("A终");
  if (index === startB) markers.push("B起");
  if (index === endB) markers.push("B终");
  return markers.join(" ");
};

function canSelectBlindCard(status: number) {
  return status === 0x1000 || status === 0x1010 || status === 0x1011 || status === 0x1012;
}

const onMenuClick = ({ event, target, item }: any) => {
  const index = target.getAttribute("index");
  if (index === null || isNaN(index)) return;

  if (editorStore.isEditorMode) {
    if (item.value === "copy") {
      editorStore.copySpell(index);
    } else if (item.value === "paste") {
      editorStore.pasteSpell(index);
    } else if (item.value === "clear") {
      editorStore.clearSpell(index);
    }
  } else {
    if (item.isReset != null && item.isReset == false) {
      gameStore.finishSpell(parseInt(index), false, gameStore.spellStatus[index] === 5 ? 0 : 1);
    } else {
      if (item.value == 0x100) {
        gameStore.refreshSpell(parseInt(index));
      } else {
        gameStore.updateSpellStatus(parseInt(index), item.value);
      }
    }
  }
};
const stopBGM = () => {
  turn1CountdownAudioRef.value?.stop();
  turn2CountdownAudioRef.value?.stop();
  turn3CountdownAudioRef.value?.stop();
};
watch(
  () => roomStore.roomData.started,
  () => {
    stopBGM();
  }
);
const showAlert = (text?: string, color?: string) => {
  gameAlertRef.value.show(text, color);
};
const hideAlert = () => {
  gameAlertRef.value.hide();
};

watch(
  () => editorStore.isEditorMode,
  (value) => {
    value ? hideAlert() : showAlert();
  }
);

const warnGamePoint = () => {
  lineWarnAudioRef.value?.stop();
  lineWarnAudioRef.value?.play();
};

const infoCaptureCard = () => {
  captureCardAudioRef.value?.play();
};

const infoFailCard = () => {
  captureCardFailureAudioRef.value?.play();
};

const infoSkipAvailable = () => {
  gamePointAudioRef.value?.stop();
  gamePointAudioRef.value?.play();
};

const infoWinGame = () => {
  muteSFXOnGameEnd();
  winGameAudioRef.value?.play();
};

const infoLoseGame = () => {
  muteSFXOnGameEnd();
  loseGameAudioRef.value?.play();
};

const muteSFXOnGameEnd = () => {
  captureCardAudioRef.value?.stop();
  captureCardFailureAudioRef.value?.stop();
  lineWarnAudioRef.value?.stop();
  spellCardGrabbedAudioRef.value?.stop();
  startGameAudioRef.value?.stop();
  pauseAudioRef.value?.stop();
};

watch(
  () => gameStore.spellCardGrabbedFlag,
  (val) => {
    if (val) {
      spellCardGrabbedAudioRef.value?.stop();
      spellCardGrabbedAudioRef.value?.play();
    }
  }
);

const gameStarted = computed(() => gameStore.gameStatus === GameStatus.STARTED);
watch(gameStarted, (started) => {
  if (started) {
    startGameAudioRef.value?.stop();
    startGameAudioRef.value?.play();
  }
});

const gameCountDown = computed(() => gameStore.gameStatus === GameStatus.COUNT_DOWN);
watch(gameCountDown, (started) => {
  if (started) {
    startGameAudioRef.value?.stop();
    startGameAudioRef.value?.play();
  }
});

const gamePaused = computed(() => gameStore.gameStatus === GameStatus.PAUSED);
watch(gamePaused, (paused) => {
  if (paused) {
    pauseAudioRef.value?.stop();
    pauseAudioRef.value?.play();
  }
});

onMounted(() => {
  ws.on(WebSocketPushActionType.PUSH_GM_WARN_PLAYER, () => {
    spellCardGrabbedAudioRef.value?.stop();
    spellCardGrabbedAudioRef.value?.play();
  });
  // Mit.on("right_link_start", () => {
  //   spellCardGrabbedAudioRef.value?.play();
  // });
});
onUnmounted(() => {
  // Mit.off("right_link_start");
  ws.off(WebSocketPushActionType.PUSH_GM_WARN_PLAYER);
});

watch(
  () => gameStore.gameStatus,
  (value) => {
    if (value === 1 && BGMpaused.value) {
      const score = roomData.value.score[0] + roomData.value.score[1];
      const time = roomStore.roomConfig.countdown - Math.ceil(gameStore.leftTime / 1000);
      switch (score) {
        case 0:
          turn1CountdownAudioRef.value?.setCurrent(time);
          turn1CountdownAudioRef.value?.play();
          break;
        case 1:
          turn2CountdownAudioRef.value?.setCurrent(time);
          turn2CountdownAudioRef.value?.play();
          break;
        case 2:
          turn3CountdownAudioRef.value?.setCurrent(time);
          turn3CountdownAudioRef.value?.play();
          break;
        default:
          turn1CountdownAudioRef.value?.setCurrent(time);
          turn1CountdownAudioRef.value?.play();
      }
    } else {
      stopBGM();
    }
  }
);

// 右键菜单的数据源现在需要是动态的
const contextMenuData = computed(() => {
  if (editorStore.isEditorMode) {
    return [
      { label: "复制", value: "copy" },
      { label: "粘贴", value: "paste" },
      { label: "清空", value: "clear" },
    ];
  }
  // 返回游戏模式下的菜单
  return props.menu;
});

defineExpose({ showAlert, hideAlert, warnGamePoint, infoCaptureCard, infoFailCard, infoSkipAvailable, infoWinGame, infoLoseGame });
</script>

<style lang="scss" scoped>
.room-title {
  font-size: 28px;
  margin: 16px 0;
  display: flex;
  justify-content: center;
  align-items: center;

  .player-A {
    text-align: right;
    width: 35%;
    height: 32px;
  }

  .player-B {
    text-align: left;
    width: 35%;
    height: 32px;
  }

  .scoreboard {
    width: 30%;
    display: flex;
    justify-content: center;
    align-items: center;

    .vs-text {
      min-width: 80px;
      text-align: center;
    }

    .A-scoreboard,
    .B-scoreboard {
      width: 80px;
      height: 32px;
      display: flex;
      justify-content: center;
      align-items: center;
    }
  }

  .score-circle {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background-color: #999;
    margin: 0 3px;

    &.scored-A {
      background-color: var(--A-color);
    }

    &.scored-B {
      background-color: var(--B-color);
    }
  }
}

.rule-standard {
  width: 100%;
  height: 100%;
}

.bingo-wrap {
  box-sizing: border-box;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 0 auto;

  .bingo-inner-align {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .bingo-items {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-content: space-between;
    border: 1px solid #000;
    border-radius: 4px;
    padding: 2px;
    box-sizing: border-box;
    position: relative;

    .spell-card {
      border: 1px solid #000;
      border-radius: 4px;
      width: 19.4%;
      height: 19.4%;
    }

    .extra-lines-overlay {
      position: absolute;
      top: 2px;
      left: 2px;
      width: calc(100% - 4px);
      height: calc(100% - 4px);
      pointer-events: none;
      z-index: 10;
    }
  }
}

.bingo-effect {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 99;
  width: 100%;
  height: 100%;
}

.widget-wrap {
  margin: 10px 0;
  height: 35px;
}

.audio {
  display: none;
}

.host-buttons > * {
  margin: 0 15px;
}

.player-extra-info {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.bingo-buttons {
  display: flex;
  justify-content: center;
  align-items: center;

  & > .main-button {
    margin: 0 10px;
    height: 32px;
  }

  & > .sub-button {
    width: auto;
    min-width: 80px;
    margin: 0 10px;
    height: auto;
    display: flex;
    flex-direction: row;
    gap: 8px;
  }
}

:deep() {
  .player-extra-info > * {
    margin: 10px 0;
  }
}
</style>
