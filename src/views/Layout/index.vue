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
        <template v-if="roomStore.inRoom && !roomStore.isReplayActive">
          <div class="team-conn-group conn-group-a" :class="{ stale: localStore.connStatus !== 'online' }">
            <span
              v-for="p in teamStatuses(0)"
              :key="p.name"
              class="member-dot"
              :class="p.online ? 'member-online' : 'member-offline'"
              :title="`${p.name}：${p.online ? '在线' : '离线'}`"
            ></span>
            <span
              v-if="roomStore.myTeam === 0"
              class="member-dot self-dot"
              :class="localDotClass"
              :title="`${localStore.username}：${connStatusText}`"
            ></span>
          </div>
          <div class="team-conn-group conn-group-b" :class="{ stale: localStore.connStatus !== 'online' }">
            <span
              v-for="p in teamStatuses(1)"
              :key="p.name"
              class="member-dot"
              :class="p.online ? 'member-online' : 'member-offline'"
              :title="`${p.name}：${p.online ? '在线' : '离线'}`"
            ></span>
            <span
              v-if="roomStore.myTeam === 1"
              class="member-dot self-dot"
              :class="localDotClass"
              :title="`${localStore.username}：${connStatusText}`"
            ></span>
            <div
              v-if="roomStore.myTeam === null"
              class="conn-status local-conn"
              :class="localStore.connStatus"
              :title="connStatusTip"
            >
              <el-icon><Connection /></el-icon>
              <span>{{ connStatusText }}</span>
            </div>
          </div>
        </template>
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
const teamStatuses = (team: number) => roomStore.remotePlayerStatuses.filter((p) => p.team === team);
const localDotClass = computed(() =>
  localStore.connStatus === "online"
    ? "member-online"
    : localStore.connStatus === "connecting"
    ? "member-connecting"
    : "member-offline"
);
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

      .team-conn-group {
        position: absolute;
        top: 4px;
        z-index: 200;
        display: flex;
        align-items: center;
        gap: 3px;

        &.stale .member-dot {
          opacity: 0.55;
        }

        &.conn-group-a {
          left: 6px;
        }

        &.conn-group-b {
          right: 6px;
        }
      }

      .member-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: #999;
        box-shadow: 0 0 2px #0004;

        &.member-online {
          background-color: var(--el-color-success);
        }

        &.member-offline {
          background-color: var(--el-color-danger);
        }

        &.member-connecting {
          background-color: var(--el-color-warning);
          animation: conn-status-pulse 1.2s ease-in-out infinite;
        }

        &.self-dot {
          outline: 1px solid #fff;
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
