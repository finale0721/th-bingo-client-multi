<template>
  <div :class="cellClass" @click="onClick">
    <div class="spell-card-info">
      <!-- <div class="link-skip-marker link-skip-marker-a" v-if="linkSkippedA">A跳</div> -->
      <!-- <div class="link-skip-marker link-skip-marker-b" v-if="linkSkippedB">B跳</div> -->
      <div class="level" v-if="level && level > 100">
        <div class="level-icons" :class="levelClass">
          <el-icon v-for="(item, index) in new Array(level - 100)" :key="index"><StarFilled /></el-icon>
        </div>
      </div>
      <div class="desc">
        <!-- 使用split方法截取破折号前的内容 -->
        {{
          status === SpellStatus.ONLY_REVEAL_GAME
            ? desc?.split("-")[0] || ""
            : desc + (level > 100 ? "" : `-${levelStarString(level)}`)
        }}
      </div>
      <div class="name">{{ name }}</div>
      <div class="fail-count-a" v-if="failCountA && status < 5">失败：{{ failCountA }}</div>
      <div class="fail-count-b" v-if="failCountB && status < 5">失败：{{ failCountB }}</div>
      <div class="link-marker" v-if="linkMarker">{{ linkMarker }}</div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { ElIcon } from "element-plus";
import { SpellStatus } from "@/types";
import { useRoomStore } from "@/store/RoomStore";
import { useGameStore } from "@/store/GameStore";

const roomStore = useRoomStore();
const gameStore = useGameStore();

const props = withDefaults(
  defineProps<{
    level?: number;
    name?: string;
    disabled?: boolean;
    status?: number;
    selected?: boolean;
    desc?: string;
    failCountA?: number;
    failCountB?: number;
    isPortalA?: boolean;
    isPortalB?: boolean;
    isACurrentBoard?: boolean;
    isBCurrentBoard?: boolean;
    spellIndex?: number;
    previewCurrentBoard?: number | null;
    previewDualBoard?: number | null;
    previewPlayerABoard?: number | null;
    previewPlayerBBoard?: number | null;
    previewGetOnWhichBoard?: number[] | null;
    previewViewerIsPlayerA?: boolean | null;
    previewViewerIsPlayerB?: boolean | null;
    linkMarker?: string;
    linkStatusA?: number;
    linkStatusB?: number;
    linkSkippedA?: boolean;
    linkSkippedB?: boolean;
  }>(),
  {
    level: 0,
    name: "",
    disabled: false,
    status: 0,
    selected: false,
    desc: "",
    failCountA: 0,
    failCountB: 0,
    isPortalA: false,
    isPortalB: false,
    isACurrentBoard: true,
    isBCurrentBoard: false,
    spellIndex: -1,
    previewCurrentBoard: null,
    previewDualBoard: null,
    previewPlayerABoard: null,
    previewPlayerBBoard: null,
    previewGetOnWhichBoard: null,
    previewViewerIsPlayerA: null,
    previewViewerIsPlayerB: null,
    linkMarker: "",
    linkStatusA: 0,
    linkStatusB: 0,
    linkSkippedA: false,
    linkSkippedB: false,
  }
);

const emits = defineEmits(["click"]);

const resolvedDualBoard = computed(() => props.previewDualBoard ?? roomStore.roomConfig.dual_board);
const resolvedCurrentBoard = computed(() => props.previewCurrentBoard ?? gameStore.currentBoard);
const resolvedPlayerABoard = computed(() => props.previewPlayerABoard ?? gameStore.normalGameData.which_board_a);
const resolvedPlayerBBoard = computed(() => props.previewPlayerBBoard ?? gameStore.normalGameData.which_board_b);
const resolvedGetOnWhichBoard = computed(
  () => props.previewGetOnWhichBoard ?? gameStore.normalGameData.get_on_which_board
);
const isPlayerA = computed(() => props.previewViewerIsPlayerA ?? roomStore.isPlayerA);
const isPlayerB = computed(() => props.previewViewerIsPlayerB ?? roomStore.isPlayerB);

const playerAOnCurBoard = computed(
  () => resolvedDualBoard.value == 0 || resolvedCurrentBoard.value == resolvedPlayerABoard.value
);
const playerBOnCurBoard = computed(
  () => resolvedDualBoard.value == 0 || resolvedCurrentBoard.value == resolvedPlayerBBoard.value
);
const playerAAttainOnCurBoard = computed(
  () =>
    resolvedDualBoard.value == 0 || resolvedGetOnWhichBoard.value?.[props.spellIndex] == 1 << resolvedCurrentBoard.value
);
const playerBAttainOnCurBoard = computed(
  () =>
    resolvedDualBoard.value == 0 ||
    resolvedGetOnWhichBoard.value?.[props.spellIndex] == 0x10 << resolvedCurrentBoard.value
);
const leftSelected = computed(() => props.linkStatusA === 1 || props.status === SpellStatus.A_SELECTED);
const rightSelected = computed(() => props.linkStatusB === 3 || props.status === SpellStatus.B_SELECTED);
const leftAttained = computed(() => props.linkStatusA === 5 || props.status === SpellStatus.A_ATTAINED);
const rightAttained = computed(() => props.linkStatusB === 7 || props.status === SpellStatus.B_ATTAINED);

const cellClass = computed(() => ({
  "spell-card-cell": true,
  banned: props.status === SpellStatus.BANNED,
  "A-selected": leftSelected.value || (props.status === SpellStatus.BOTH_SELECTED && playerAOnCurBoard.value),
  "A-attained": leftAttained.value || (props.status === SpellStatus.BOTH_ATTAINED && playerAAttainOnCurBoard.value),
  "B-selected": rightSelected.value || (props.status === SpellStatus.BOTH_SELECTED && playerBOnCurBoard.value),
  "B-attained": rightAttained.value || (props.status === SpellStatus.BOTH_ATTAINED && playerBAttainOnCurBoard.value),
  "A-skipped": props.linkSkippedA,
  "B-skipped": props.linkSkippedB,
  "A-local-selected": props.selected && isPlayerA.value,
  "B-local-selected": props.selected && isPlayerB.value,
  //see-only为非选手的视觉效果
  "A-see-only": props.status === SpellStatus.LEFT_SEE_ONLY,
  "B-see-only": props.status === SpellStatus.RIGHT_SEE_ONLY,
  //完全隐藏
  Hidden: props.status === SpellStatus.BOTH_HIDDEN,
  //只显示TH[0-9]+
  "Only-reveal-game": props.status === SpellStatus.ONLY_REVEAL_GAME,
  //只显示完整的游戏信息
  "Only-reveal-game-stage": props.status === SpellStatus.ONLY_REVEAL_GAME_STAGE,
  //只显示星级
  "Only-reveal-star": props.status === SpellStatus.ONLY_REVEAL_STAR,

  "is-portal": (props.isPortalA && props.isACurrentBoard) || (props.isPortalB && props.isBCurrentBoard),
  "A-selected-other-board":
    (props.status === SpellStatus.A_SELECTED || props.status === SpellStatus.BOTH_SELECTED) && !playerAOnCurBoard.value,
  "B-selected-other-board":
    (props.status === SpellStatus.B_SELECTED || props.status === SpellStatus.BOTH_SELECTED) && !playerBOnCurBoard.value,
  "A-attained-other-board":
    (props.status === SpellStatus.A_ATTAINED || props.status === SpellStatus.BOTH_ATTAINED) &&
    !playerAAttainOnCurBoard.value,
  "B-attained-other-board":
    (props.status === SpellStatus.B_ATTAINED || props.status === SpellStatus.BOTH_ATTAINED) &&
    !playerBAttainOnCurBoard.value,
}));
const levelClass = computed(() => `level${props.level}`);

const levelStarString = (level: number) => {
  switch (level) {
    case 5:
      return "★5";
    case 4:
      return "★4";
    case 3:
      return "☆3";
    case 2:
      return "☆2";
    case 1:
      return "☆1";
    default:
      return level.toString();
  }
};

const onClick = () => {
  if (!props.disabled) {
    emits("click");
  }
};
</script>

<style lang="scss" scoped>
.spell-card-cell {
  width: 100%;
  height: 100%;
  position: relative;
  box-sizing: border-box;
  padding: 4px;
  cursor: pointer;
  user-select: none;
  z-index: 1;
  overflow: hidden;

  .spell-card-info {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    pointer-events: none;

    .level {
      position: absolute;
      top: 0;
      left: 0;
      z-index: -1;
      .level101 {
        color: rgb(223, 233, 36);
      }

      .level102 {
        color: rgb(214, 181, 31);
      }

      .level103 {
        color: rgb(212, 124, 9);
      }

      .level104 {
        color: rgb(213, 86, 18);
      }

      .level105 {
        color: red;
      }
    }

    .desc {
      position: absolute;
      bottom: 0;
      right: 0;
      font-size: 12px;
    }

    .name {
      text-align: center;
      word-break: break-all;
      white-space: "pre-wrap";
      font-size: 14px;
    }

    .fail-count-a {
      position: absolute;
      top: 0;
      right: 0;
      font-size: 12px;
      color: var(--A-color);
    }

    .fail-count-b {
      position: absolute;
      bottom: 0;
      left: 0;
      font-size: 12px;
      color: var(--B-color);
    }

    .link-marker {
      position: absolute;
      right: 50%;
      bottom: 2px;
      transform: translateX(50%);
      z-index: 3;
      display: flex;
      max-width: calc(100% - 8px);
      padding: 1px 4px;
      border: 1px solid rgba(0, 0, 0, 0.22);
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.84);
      color: #303133;
      font-size: 11px;
      line-height: 14px;
      pointer-events: none;
      white-space: nowrap;
    }

    .link-skip-marker {
      position: absolute;
      top: 2px;
      z-index: 4;
      padding: 1px 4px;
      border-radius: 3px;
      background: rgba(0, 0, 0, 0.68);
      color: #fff;
      font-size: 11px;
      line-height: 14px;
      pointer-events: none;
      white-space: nowrap;
    }

    .link-skip-marker-a {
      left: 2px;
    }

    .link-skip-marker-b {
      right: 2px;
    }
  }

  &::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    z-index: -10;
  }

  &::after {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    z-index: -10;
  }

  &.A-selected {
    &::before {
      background-image: linear-gradient(var(--A-color) 60%, var(--A-color-dark));
      -webkit-animation: breath 3s infinite linear;
      animation: breath 3s infinite linear;
    }
  }

  &.B-selected {
    &::after {
      background-image: linear-gradient(var(--B-color) 60%, var(--B-color-dark));
      -webkit-animation: breath 3s infinite linear;
      animation: breath 3s infinite linear;
    }
  }

  &.A-selected.B-selected {
    &::before {
      transform: skew(-0.89rad) translateX(0%);
      left: -50%;
    }
    &::after {
      transform: skew(-0.89rad) translateX(0%);
      left: 50%;
    }
  }

  &.A-local-selected {
    &::before {
      background-image: linear-gradient(var(--A-color) 60%, var(--A-color-dark));
      opacity: 0.15;
    }
  }

  &.B-local-selected {
    &::after {
      background-image: linear-gradient(var(--B-color) 60%, var(--B-color-dark));
      opacity: 0.15;
    }
  }

  &.A-attained {
    &::before {
      background-image: linear-gradient(var(--A-color) 60%, var(--A-color-dark));
    }
  }

  &.B-attained {
    &::after {
      background-image: linear-gradient(var(--B-color) 60%, var(--B-color-dark));
    }
  }

  &.A-attained.B-attained {
    &::before {
      transform: skew(-0.89rad) translateX(0%);
      left: -50%;
    }
    &::after {
      transform: skew(-0.89rad) translateX(0%);
      left: 50%;
    }
  }

  &.A-selected.B-attained,
  &.A-attained.B-selected {
    &::before {
      transform: skew(-0.89rad) translateX(0%);
      left: -50%;
    }
    &::after {
      transform: skew(-0.89rad) translateX(0%);
      left: 50%;
    }
  }

  &.A-skipped::before,
  &.B-skipped::after {
    filter: saturate(0.45);
    opacity: 0.58;
  }

  &.banned {
    text-decoration: line-through;

    &::before {
      background-image: linear-gradient(#ccc 60%, #666);
    }

    .level-icons {
      color: #666 !important;
    }
  }

  &.Hidden {
    .spell-card-info > * {
      visibility: hidden;
    }
  }

  &.A-see-only {
    &::after {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 10%;
      height: 10%;
      background-color: var(--A-color);
      z-index: 2; // 覆盖在现有内容之上
      pointer-events: none;
      opacity: 0.3;
    }
  }

  &.B-see-only {
    &::after {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 10%;
      height: 10%;
      background-color: var(--B-color);
      z-index: 2; // 覆盖在现有内容之上
      pointer-events: none;
      opacity: 0.3;
    }
  }

  &.Only-reveal-game {
    .spell-card-info > *:not(.desc) {
      visibility: hidden;
    }
  }

  &.Only-reveal-game-stage {
    .spell-card-info > *:not(.desc) {
      visibility: hidden;
    }
  }

  &.Only-reveal-star {
    .spell-card-info > *:not(.level) {
      visibility: hidden;
    }
  }

  &.A-selected-other-board {
    &::before {
      background-image: linear-gradient(var(--A-color) 60%, var(--A-color-dark));
      -webkit-animation: breath 3s infinite linear;
      animation: breath 3s infinite linear;
      filter: saturate(0.6);
    }
  }

  &.B-selected-other-board {
    &::after {
      background-image: linear-gradient(var(--B-color) 60%, var(--B-color-dark));
      -webkit-animation: breath 3s infinite linear;
      animation: breath 3s infinite linear;
      filter: saturate(0.6);
    }
  }

  &.A-attained-other-board.B-attained-other-board,
  &.A-selected-other-board.B-selected-other-board,
  &.A-selected-other-board.B-selected,
  &.A-selected.B-selected-other-board {
    &::before {
      transform: skew(-0.89rad) translateX(0%);
      left: -50%;
    }
    &::after {
      transform: skew(-0.89rad) translateX(0%);
      left: 50%;
    }
  }

  &.A-attained-other-board {
    &::before {
      background-image: linear-gradient(var(--A-color) 60%, var(--A-color-dark));
      opacity: 0.5;
      filter: saturate(0.6);
    }
  }

  &.B-attained-other-board {
    &::after {
      background-image: linear-gradient(var(--B-color) 60%, var(--B-color-dark));
      opacity: 0.5;
      filter: saturate(0.6);
    }
  }

  &.is-portal {
    // 此处不改变 spell-card-cell 自身的位置
    // 而是通过其子元素的伪元素来添加图标，以避免样式冲突
    .spell-card-info::before {
      content: "🔄";
      position: absolute;
      top: 0; // 距离顶部边缘一点距离，视觉效果更好
      left: 0; // 距离左侧边缘一点距离
      font-size: 16px; // 可根据需要调整图标大小
      z-index: 5; // 确保图标显示在最上层
      text-shadow: 0 0 1px rgba(0, 0, 0, 0.7);
      opacity: 0.5;
    }
  }
}
</style>
