<template>
  <div class="bingo-effect" ref="wrap">
    <konva-stage ref="stage" :config="stageConfig">
      <konva-layer ref="layer"></konva-layer>
    </konva-stage>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, watch, nextTick } from "vue";
import Konva from "konva";
import { useRoomStore } from "@/store/RoomStore";

export default defineComponent({
  name: "BingoEffect",
  data() {
    return {
      width: 0 as number,
      height: 0 as number,
      listA: [0] as number[],
      listB: [4] as number[],
      stageNode: null as any,
      layerNode: null as any,
    };
  },
  setup() {
    const roomStore = useRoomStore();
    const wrap = ref();
    const stage = ref();
    const layer = ref();
    const lineA = ref<Konva.Line | null>();
    const lineB = ref<Konva.Line | null>();

    // watch(
    //   () => store.getters.roomSettings.playerA.color,
    //   (value) => {
    //     lineA.value?.stroke(value);
    //     lineA.value?.draw();
    //   }
    // );

    // watch(
    //   () => store.getters.roomSettings.playerB.color,
    //   (value) => {
    //     lineB.value?.stroke(value);
    //     lineB.value?.draw();
    //   }
    // );

    return {
      wrap,
      stage,
      layer,
      lineA,
      lineB,
      roomSettings: computed(() => roomStore.roomSettings),
    };
  },
  props: {
    routeA: {
      type: Array,
      required: true,
    },
    routeB: {
      type: Array,
      required: true,
    },
    boardSize: {
      type: Number,
      default: 5,
    },
  },
  watch: {
    routeA(value) {
      this.listA = value as number[];
      this.drawLine("A");
    },
    routeB(value) {
      this.listB = value as number[];
      this.drawLine("B");
    },
  },
  computed: {
    stageConfig(): any {
      return { width: this.width, height: this.height };
    },
  },
  mounted() {
    this.stageNode = this.stage.getNode();
    this.layerNode = this.layer.getNode();
    nextTick(() => {
      this.width = this.wrap.offsetWidth;
      this.height = this.wrap.offsetHeight;
      const AStart = this.getCenterPosition(this.listA[0] || 0);
      const BStart = this.getCenterPosition(this.listB[0] || this.boardSize - 1);
      this.lineA = new Konva.Line({
        points: [AStart.x, AStart.y, AStart.x, AStart.y],
        stroke: this.roomSettings.playerA.color,
        strokeWidth: 8,
        lineCap: "round",
        lineJoin: "round",
        opacity: 0.6,
        closed: false,
      });
      this.lineB = new Konva.Line({
        points: [BStart.x, BStart.y, BStart.x, BStart.y],
        stroke: this.roomSettings.playerB.color,
        strokeWidth: 8,
        lineCap: "round",
        lineJoin: "round",
        opacity: 0.6,
        closed: false,
      });
      this.layerNode.add(this.lineA);
      this.layerNode.add(this.lineB);
      this.drawLine("A");
      this.drawLine("B");
    });
  },
  methods: {
    drawLine(tag: string) {
      const list = tag === "A" ? this.listA : this.listB;
      const line = tag === "A" ? this.lineA : this.lineB;
      if (!line) return;
      const lineArr: number[] = [];
      if (list.length <= 1) {
        const position = this.getCenterPosition(list[0] || 0);
        lineArr.push(position.x, position.y, position.x, position.y);
      } else {
        for (const item of list) {
          const position = this.getCenterPosition(item);
          lineArr.push(position.x, position.y);
        }
      }
      line.points(lineArr);
      line.draw();
    },
    getCenterPosition(index: number) {
      const cellWidth = this.width / this.boardSize;
      const cellHeight = this.height / this.boardSize;
      const r = index % this.boardSize;
      const c = Math.floor(index / this.boardSize);
      return {
        x: (r + 0.5) * cellWidth,
        y: (c + 0.5) * cellHeight,
      };
    },
  },
});
</script>

<style lang="scss" scoped>
.bingo-effect {
  width: 100%;
  height: 100%;
}
.effect-canvas {
  width: 100%;
  height: 100%;
}
</style>
