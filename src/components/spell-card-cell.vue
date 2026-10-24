<template>
  <div :class="cellClass" @click="onClick">
    <div class="spell-card-info">
      <div class="level" v-if="level && level > 100">
        <div class="level-icons" :class="levelClass">
          <el-icon v-for="(item, index) in new Array(level - 100)" :key="index"><StarFilled /></el-icon>
        </div>
      </div>
      <!-- 盲盒模式2 的“只显示星级” -->
      <div class="level star-only" v-if="contentReveal === 3 && level <= 100">{{ levelStarString(level) }}</div>
      <div class="desc">
        {{ displayDesc }}
      </div>
      <div class="name">{{ name }}</div>
      <div class="fail-count-a" v-if="failCountA && !isStandardCell">失败：{{ failCountA }}</div>
      <div class="fail-count-b" v-if="failCountB && !isStandardCell">失败：{{ failCountB }}</div>
      <div class="link-marker" v-if="linkMarker">{{ linkMarker }}</div>
      <!-- 收取次数圆点 / 双盘收取标记 -->
      <div class="capture-markers" v-if="hasMarkers">
        <template v-if="isDualBoard">
          <div v-if="dualMarkerA" class="dual-marker marker-a">
            <span class="capture-dot dot-a"></span>
            <span v-if="dualMarkerA.check" class="half-check check-a">✓</span>
          </div>
          <div v-if="dualMarkerB" class="dual-marker marker-b">
            <span class="capture-dot dot-b"></span>
            <span v-if="dualMarkerB.check" class="half-check check-b">✓</span>
          </div>
        </template>
        <template v-else>
          <span v-for="(dot, i) in aDotList" :key="'da' + i" class="capture-dot dot-a" :style="{ top: i * 8 + 2 + 'px' }"></span>
          <span v-for="(dot, i) in bDotList" :key="'db' + i" class="capture-dot dot-b" :style="{ top: i * 8 + 2 + 'px' }"></span>
        </template>
      </div>
      <span v-if="localSelected" class="my-selection-star" title="你选择的符卡">★</span>
      <!-- 非选手视角：标识当前正在选择该格的玩家 -->
      <div
        v-if="selectionNames.length"
        class="selection-names"
        :title="selectionNames.map((n) => n.name).join('、')"
      >
        <span
          v-for="n in selectionNames"
          :key="n.team + '-' + n.name"
          :class="n.team === 0 ? 'name-a' : 'name-b'"
        >{{ n.name }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { ElIcon } from "element-plus";
import { CellView, SpellStatus } from "@/types";
import { useRoomStore } from "@/store/RoomStore";

const roomStore = useRoomStore();

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
    linkMarker?: string;
    linkStatusA?: number;
    linkStatusB?: number;
    linkSkippedA?: boolean;
    linkSkippedB?: boolean;
    /** 标准赛：本盘面该格的按查看者裁剪视图 */
    cell?: CellView | null;
    /** 标准赛：另一盘面同 index 的视图（单盘为 null） */
    otherCell?: CellView | null;
    isDualBoard?: boolean;
    viewerIsA?: boolean;
    viewerIsB?: boolean;
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
    linkMarker: "",
    linkStatusA: 0,
    linkStatusB: 0,
    linkSkippedA: false,
    linkSkippedB: false,
    cell: null,
    otherCell: null,
    isDualBoard: false,
    viewerIsA: false,
    viewerIsB: false,
  }
);

const emits = defineEmits(["click"]);

const isStandardCell = computed(() => !!props.cell);

// ------------------------------------------------------------------
// 标准赛：只读 CellView
// ------------------------------------------------------------------
const leftSelected = computed(() => {
  if (props.cell) return props.cell.selected_by_a.length > 0;
  return props.linkStatusA === 1 || props.status === SpellStatus.A_SELECTED;
});
const rightSelected = computed(() => {
  if (props.cell) return props.cell.selected_by_b.length > 0;
  return props.linkStatusB === 3 || props.status === SpellStatus.B_SELECTED;
});
const leftAttained = computed(() => {
  if (props.cell) {
    if (props.isDualBoard) return props.cell.fully_captured_by === 0;
    return props.cell.captured_by_a;
  }
  return props.linkStatusA === 5 || props.status === SpellStatus.A_ATTAINED;
});
const rightAttained = computed(() => {
  if (props.cell) {
    if (props.isDualBoard) return props.cell.fully_captured_by === 1;
    return props.cell.captured_by_b;
  }
  return props.linkStatusB === 7 || props.status === SpellStatus.B_ATTAINED;
});

// 另一盘面上的选择/收取（仅双盘）
const otherLeftSelected = computed(
  () => !!props.cell && !!props.otherCell && props.otherCell.selected_by_a.length > 0 && !leftSelected.value
);
const otherRightSelected = computed(
  () => !!props.cell && !!props.otherCell && props.otherCell.selected_by_b.length > 0 && !rightSelected.value
);

const contentReveal = computed(() => {
  if (props.cell) return props.cell.content_reveal;
  // 旧状态兼容（回放/编辑器）
  switch (props.status) {
    case SpellStatus.BOTH_HIDDEN:
      return 0;
    case SpellStatus.ONLY_REVEAL_GAME:
      return 1;
    case SpellStatus.ONLY_REVEAL_GAME_STAGE:
      return 2;
    case SpellStatus.ONLY_REVEAL_STAR:
      return 3;
    case SpellStatus.LEFT_SEE_ONLY:
    case SpellStatus.RIGHT_SEE_ONLY:
      return 4;
    default:
      return 4;
  }
});

const localSelected = computed(() => {
  if (props.cell) return props.cell.my_selected || props.selected;
  return props.selected && (props.viewerIsA || props.viewerIsB || roomStore.isPlayerA || roomStore.isPlayerB);
});

/** 非选手视角（导播/观众/回放）才显示选卡者名字 */
const selectionNames = computed(() => {
  if (props.viewerIsA || props.viewerIsB || !props.cell) return [];
  return [
    ...props.cell.selected_by_a.map((name) => ({ name, team: 0 })),
    ...props.cell.selected_by_b.map((name) => ({ name, team: 1 })),
  ];
});

// 单盘收取圆点：完整收取后隐藏
const aDotList = computed(() => {
  if (!props.cell || props.isDualBoard) return [];
  if (props.cell.fully_captured_by !== null) return [];
  const count = props.cell.capture_count_a;
  return typeof count === "number" ? new Array(count).fill(0) : [];
});
const bDotList = computed(() => {
  if (!props.cell || props.isDualBoard) return [];
  if (props.cell.fully_captured_by !== null) return [];
  const count = props.cell.capture_count_b;
  return typeof count === "number" ? new Array(count).fill(0) : [];
});

// 双盘收取标记：
// 本面已收 → 圆点 + 对号；仅另一面已收 → 圆点。
const dualMarkerA = computed(() => {
  if (!props.cell || !props.otherCell || !props.isDualBoard) return null;
  // 完整收取后只保留实色，不再显示圆点/对号
  if (props.cell.fully_captured_by !== null) return null;
  const thisBoard = props.cell.captured_by_a;
  const otherBoard = props.otherCell.captured_by_a;
  if (!thisBoard && !otherBoard) return null;
  return { check: thisBoard };
});
const dualMarkerB = computed(() => {
  if (!props.cell || !props.otherCell || !props.isDualBoard) return null;
  if (props.cell.fully_captured_by !== null) return null;
  const thisBoard = props.cell.captured_by_b;
  const otherBoard = props.otherCell.captured_by_b;
  if (!thisBoard && !otherBoard) return null;
  return { check: thisBoard };
});
const hasMarkers = computed(() =>
  props.isDualBoard
    ? !!dualMarkerA.value || !!dualMarkerB.value
    : aDotList.value.length > 0 || bDotList.value.length > 0
);

const cellClass = computed(() => ({
  "spell-card-cell": true,
  banned: !props.cell && props.status === SpellStatus.BANNED,
  "A-selected": leftSelected.value,
  "A-attained": leftAttained.value,
  "B-selected": rightSelected.value,
  "B-attained": rightAttained.value,
  "A-skipped": props.linkSkippedA,
  "B-skipped": props.linkSkippedB,
  "A-local-selected": localSelected.value && (props.cell ? props.viewerIsA : true),
  "B-local-selected": localSelected.value && (props.cell ? props.viewerIsB : true),
  Hidden: contentReveal.value === 0,
  "Only-reveal-game": contentReveal.value === 1,
  "Only-reveal-game-stage": contentReveal.value === 2,
  "Only-reveal-star": contentReveal.value === 3,
  "A-selected-other-board": otherLeftSelected.value,
  "B-selected-other-board": otherRightSelected.value,
}));
const levelClass = computed(() => `level${props.level}`);

const displayDesc = computed(() => {
  if (contentReveal.value === 1) return props.desc?.split("-")[0] || "";
  return props.desc + (props.level > 100 ? "" : `-${levelStarString(props.level)}`);
});

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

      &.star-only {
        z-index: 1;
        font-size: 14px;
        font-weight: 700;
        color: #303133;
      }
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

    .capture-markers {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 6;
    }

    .capture-dot {
      position: absolute;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      border: 1px solid rgba(0, 0, 0, 0.65);
      box-shadow: 0 0 2px rgba(255, 255, 255, 0.95);

      &.dot-a {
        left: 2px;
        background: var(--A-color);
      }

      &.dot-b {
        right: 2px;
        background: var(--B-color);
      }

    }

    .half-check {
      position: absolute;
      top: 0;
      font-size: 12px;
      font-weight: 700;
      line-height: 12px;
      text-shadow: 0 0 2px #fff, 0 0 2px #fff;
      pointer-events: none;

      &.check-a {
        left: 2px;
        color: var(--A-color);
      }

      &.check-b {
        right: 2px;
        color: var(--B-color);
      }
    }

    // 双盘：本面已收 = 圆点 + 对号；仅另一面已收 = 圆点
    .dual-marker {
      position: absolute;
      top: 0;
      display: flex;
      align-items: center;
      gap: 2px;
      height: 12px; // 固定行高：仅有圆点与圆点+对号时圆点保持同一水平线
      pointer-events: none;

      &.marker-a {
        left: 2px;
      }

      &.marker-b {
        right: 2px;
        flex-direction: row-reverse;
      }

      .capture-dot,
      .half-check {
        position: static;
        top: auto;
        right: auto;
        left: auto;
      }
    }

    .my-selection-star {
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      z-index: 7;
      color: #ffd54a;
      font-size: 13px;
      line-height: 1;
      text-shadow: 0 0 2px rgba(0, 0, 0, 0.9), 0 0 3px rgba(0, 0, 0, 0.7);
      pointer-events: none;
    }

    // 非选手视角：正在选择该格的玩家名
    .selection-names {
      position: absolute;
      top: 1px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 7;
      display: flex;
      align-items: center;
      max-width: calc(100% - 48px);
      padding: 0 3px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.78);
      font-size: 11px;
      line-height: 14px;
      white-space: nowrap;
      overflow: hidden;
      pointer-events: none;

      span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 600;

        &:not(:last-child)::after {
          content: "、";
          font-weight: 400;
          color: #909399;
        }
      }

      .name-a {
        color: var(--A-color-dark, var(--A-color));
      }

      .name-b {
        color: var(--B-color-dark, var(--B-color));
      }
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
    // 圆点/对号属于位置信息，盲盒隐藏时仍然显示
    .spell-card-info > .capture-markers {
      visibility: visible;
    }
  }

  &.Only-reveal-game {
    .spell-card-info > *:not(.desc) {
      visibility: hidden;
    }
    .spell-card-info > .capture-markers {
      visibility: visible;
    }
  }

  &.Only-reveal-game-stage {
    .spell-card-info > *:not(.desc) {
      visibility: hidden;
    }
    .spell-card-info > .capture-markers {
      visibility: visible;
    }
  }

  &.Only-reveal-star {
    .spell-card-info > *:not(.level) {
      visibility: hidden;
    }
    .spell-card-info > .capture-markers {
      visibility: visible;
    }
  }

  // 选卡者名字属于位置信息，盲盒遮罩下仍然显示
  &.Hidden,
  &.Only-reveal-game,
  &.Only-reveal-game-stage,
  &.Only-reveal-star {
    .spell-card-info > .selection-names {
      visibility: visible;
    }
  }

  // 另一面的选择：明显更浅；两面同队都有选择时由 .A-selected/.B-selected 以正常颜色显示
  &.A-selected-other-board {
    &::before {
      background-image: linear-gradient(var(--A-color) 60%, var(--A-color-dark));
      -webkit-animation: breath-light 3s infinite linear;
      animation: breath-light 3s infinite linear;
      filter: saturate(0.45);
    }
  }

  &.B-selected-other-board {
    &::after {
      background-image: linear-gradient(var(--B-color) 60%, var(--B-color-dark));
      -webkit-animation: breath-light 3s infinite linear;
      animation: breath-light 3s infinite linear;
      filter: saturate(0.45);
    }
  }
}

@keyframes breath-light {
  from {
    opacity: 0.3;
  }

  50% {
    opacity: 0.5;
  }

  to {
    opacity: 0.3;
  }
}
</style>
