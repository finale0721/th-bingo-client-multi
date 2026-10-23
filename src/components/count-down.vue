<template>
  <div
    class="count-down"
    :style="{
      'font-size': size + 'px',
    }"
  >
    <template v-if="gameStore.leftTime >= 3600000">
      <div class="hour">{{ format(hour) }}</div>
      <div class="colon">:</div>
    </template>
    <div class="minute">{{ format(minute) }}</div>
    <div class="colon">:</div>
    <div class="second">{{ format(second) }}</div>
  </div>
</template>

<script lang="ts" setup>
import {onUnmounted, ref, watch} from "vue";
import { useGameStore } from "@/store/GameStore";
import { GameStatus } from "@/types";

const gameStore = useGameStore();

const props = withDefaults(
  defineProps<{
    mode?: "countdown" | "stopwatch";
    size?: number;
  }>(),
  {
    mode: "countdown",
    size: 14,
  }
);

const emits = defineEmits(["complete"]);

const timer = ref(0);
const hour = ref(0);
const minute = ref(0);
const second = ref(0);

// 新增：用于存储倒计时的目标结束时间戳
let endTime = 0;

const start = () => {
  if (timer.value) {
    window.clearInterval(timer.value);
    timer.value = 0;
  }
  if (props.mode === "countdown") {
    if (gameStore.gameStatus !== GameStatus.PAUSED && gameStore.leftTime > 0) {
      // 核心改动 1：计算并记录倒计时的结束时间戳
      // endTime = 当前时间的时间戳 + 剩余的毫秒数
      endTime = Date.now() + gameStore.leftTime;

      timer.value = window.setInterval(() => {
        // 核心改动 2：不再是简单地减去1000ms
        // 而是用未来的结束时间减去当前时间，得到精确的剩余时间
        const remainingTime = endTime - Date.now();

        if (remainingTime <= 0) {
          gameStore.leftTime = 0; // 确保时间归零
          stop();
          emits("complete");
        } else {
          gameStore.leftTime = remainingTime;
        }
      }, 1000); // 定时器仍然每秒触发一次，用于刷新UI
    }
  } else if (props.mode === "stopwatch") {
    // 秒表模式的逻辑（如果需要）
  }
};
const pause = () => {
  if (timer.value) {
    window.clearInterval(timer.value);
    timer.value = 0;
  }
};
const stop = () => {
  pause();
  // stop时不需要重置 hour, minute, second, 因为 watch 会处理
  gameStore.leftTime = 0;
};
const format = (number: number): string => {
  return number < 10 ? `0${number}` : "" + number;
};

watch(
  () => gameStore.leftTime,
  (value) => {
    if (value <= 0) {
      second.value = 0;
      minute.value = 0;
      hour.value = 0;
      return;
    }
    // 注意：这里不再需要 Math.ceil，因为我们的时间戳计算是精确的
    const totalSeconds = Math.floor(value / 1000);
    second.value = totalSeconds % 60;

    // 这里的逻辑稍微调整以避免旧代码中的一个潜在计算错误
    const totalMinutes = Math.floor(totalSeconds / 60);
    if (totalMinutes >= 60) {
      hour.value = Math.floor(totalMinutes / 60);
      minute.value = totalMinutes % 60;
    } else {
      hour.value = 0; // 确保小时在不需要时为0
      minute.value = totalMinutes;
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  pause(); // 在组件卸载时调用 pause 方法来清除计时器
});

defineExpose({ start, pause, stop });
</script>

<style lang="scss" scoped>
.count-down {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;

  .colon {
    margin: 0 10px;
  }
}
</style>