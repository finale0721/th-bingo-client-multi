<template>
  <div
    class="layout"
    :style="{
      '--A-color': roomSettings.playerA && roomSettings.playerA.color,
      '--B-color': roomSettings.playerB && roomSettings.playerB.color,
      '--A-color-dark': roomSettings.playerA && getDarkColor(roomSettings.playerA.color),
      '--B-color-dark': roomSettings.playerB && getDarkColor(roomSettings.playerB.color),
      '--bg-color': roomSettings.backgroundColor,
      '--bg-color-reverse': roomSettings.backgroundColorReverse,
      '--layout-inner-width': layoutInnerWidth,
      '--main-window-width': mainWindowWidth,
      '--main-window-height': mainWindowHeight,
      '--info-window-height': infoWindowHeight,
    }"
  >
    <div class="layout-inner">
      <div class="layout-main-window">
        <router-view />
        <div class="conn-status-group" :class="{ stale: localStore.connStatus !== 'online' }">
          <div
            v-for="p in roomStore.remotePlayerStatuses"
            :key="p.name"
            class="conn-status player-conn"
            :class="p.online ? 'player-online' : 'player-offline'"
            :title="p.online ? `「${p.name}」与服务器连接正常` : `「${p.name}」已断开连接`"
          >
            <span class="player-name">{{ p.name }}</span>
            <span class="dot"></span>
          </div>
          <div class="conn-status" :class="localStore.connStatus" :title="connStatusTip">
            <el-icon><Connection /></el-icon>
            <span>{{ connStatusText }}</span>
          </div>
        </div>
      </div>
      <div class="layout-info-window">
        <info-window></info-window>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import InfoWindow from "./components/InfoWindow.vue";
import { useRoomStore } from "@/store/RoomStore";
import { useLocalStore } from "@/store/LocalStore";
import { ElIcon } from "element-plus";
import { Connection } from "@element-plus/icons-vue";

const roomStore = useRoomStore();
const localStore = useLocalStore();
const connStatusText = computed(
  () => ({ online: "已连接", connecting: "连接中", offline: "已断开" }[localStore.connStatus])
);
const connStatusTip = computed(
  () =>
    ({
      online: "与服务器连接正常",
      connecting: "正在建立连接或掉线后自动重连中",
      offline: "多次重连失败，请检查网络后刷新页面",
    }[localStore.connStatus])
);
const roomSettings = computed(() => roomStore.roomSettings);
const boardSize = computed(() => roomStore.inRoom ? roomStore.roomConfig.board_size || roomSettings.value.board_size || 5 : 5);
const layoutInnerWidth = computed(() => boardSize.value === 6 ? "1508px" : "1320px");
const mainWindowWidth = computed(() => boardSize.value === 6 ? "1148px" : "960px");
const mainWindowHeight = computed(() => boardSize.value === 6 ? "780px" : "680px");
const infoWindowHeight = computed(() => boardSize.value === 6 ? "780px" : "680px");

const getDarkColor = (color: string) => {
  if (!color) {
    return "";
  }
  const arr = color.match(/\((.*),(.*)%,(.*)%(,(.*))?\)/);
  if (arr === null) {
    return "";
  }
  if (arr[5]) {
    return `hsla(${arr[1]},${arr[2]}%,${parseInt(arr[3]) - 20}%,${arr[5]})`;
  } else {
    return `hsl(${arr[1]},${arr[2]}%,${parseInt(arr[3]) - 20}%)`;
  }
};
</script>

<style lang="scss" scoped>
@import "@/assets/scss/variable.scss";

.layout {
  width: 100%;
  height: 100%;
  position: relative;

  .layout-inner {
    width: var(--layout-inner-width, #{$minWidth});
    display: flex;
    justify-content: space-between;

    .layout-main-window {
      width: var(--main-window-width, 960px);
      height: var(--main-window-height, #{$minHeight});
      box-shadow: #00000044 0 0 5px 5px;
      border-radius: 5px;
      padding: 10px;
      box-sizing: border-box;
      position: relative;
      background-color: #ffffffdd;

      .conn-status-group {
        position: absolute;
        top: 2px;
        right: 2px;
        z-index: 200;
        display: flex;
        align-items: center;
        gap: 4px;

        // 自身连接异常时远端状态可能已过期，灰显以示不确定
        &.stale .player-conn {
          opacity: 0.55;
        }
      }

      .conn-status {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        border-radius: 14px;
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        color: #fff;
        user-select: none;
        box-shadow: 0 1px 4px #0003;
        transition: background-color 0.3s;

        .el-icon {
          font-size: 15px;
        }

        &.online {
          background-color: var(--el-color-success);
        }

        &.connecting {
          background-color: var(--el-color-warning);
          animation: conn-status-pulse 1.2s ease-in-out infinite;
        }

        &.offline {
          background-color: var(--el-color-danger);
          animation: conn-status-pulse 1.2s ease-in-out infinite;
        }

        &.player-conn {
          background-color: #303133cc;
          max-width: 160px;

          .player-name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .dot {
            flex-shrink: 0;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: var(--el-color-success);
          }

          &.player-offline .dot {
            background-color: var(--el-color-danger);
            animation: conn-status-pulse 1.2s ease-in-out infinite;
          }
        }
      }
    }

    .layout-info-window {
      width: 320px;
      height: var(--info-window-height, #{$minHeight});
      box-shadow: #00000044 0 0 5px 5px;
      border-radius: 5px;
      padding: 10px 15px;
      box-sizing: border-box;
      overflow: hidden;
      background-color: #ffffffdd;
    }
  }
}

@media (min-width: $minWidth) and (min-height: $minHeight) {
  .layout-inner {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
}

@media (min-width: $minWidth) and (max-height: $minHeight) {
  .layout-inner {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
  }
}

@media (max-width: $minWidth) and (min-height: $minHeight) {
  .layout-inner {
    position: absolute;
    top: 50%;
    left: 0;
    transform: translateY(-50%);
  }
}

@media (max-width: $minWidth) and (max-height: $minHeight) {
  .layout-inner {
    position: absolute;
    top: 0;
    left: 0;
  }
}

@keyframes conn-status-pulse {
  50% {
    opacity: 0.5;
  }
}
</style>
