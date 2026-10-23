<template>
  <el-dialog v-model="visible" title="房间列表" width="750px">
    <div class="dialog-content">
      <div class="custom-table">
        <div class="custom-table-header">
          <div class="header-cell" style="width: 150px">房间号</div>
          <div class="header-cell" style="width: 150px">Host</div>
          <div class="header-cell" style="width: 150px">Player A</div>
          <div class="header-cell" style="width: 150px">Player B</div>
          <div class="header-cell" style="flex: 1; text-align: center">操作</div>
        </div>
        <div v-if="sortedRoomList.length === 0" class="no-data">暂无房间</div>
        <template v-else>
          <div class="custom-table-row" v-for="row in sortedRoomList" :key="row.rid">
            <div class="body-cell" style="width: 150px">{{ row.rid }}</div>
            <div class="body-cell" style="width: 150px">{{ row.host }}</div>
            <div class="body-cell" style="width: 150px">{{ row.playerA }}</div>
            <div class="body-cell" style="width: 150px">{{ row.playerB }}</div>
            <div class="body-cell" style="flex: 1; text-align: center">
              <el-button :type="getButtonType(row)" @click="joinRoom(row.rid)" size="small">加入</el-button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </el-dialog>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from "vue";
import { ElButton, ElDialog } from "element-plus";
import { useRoomStore } from "@/store/RoomStore";
import { useLocalStore } from "@/store/LocalStore";

interface RoomInfo {
  rid: string;
  host: string;
  players: string[];
  isMatching: boolean;
  lastActive: number;
}

const props = defineProps({
  modelValue: Boolean,
});
const emit = defineEmits(["update:modelValue", "join-room"]);

const roomStore = useRoomStore();
const localStore = useLocalStore();
const roomList = ref<RoomInfo[]>([]);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue) {
      getRoomList();
    }
  }
);

const sortedRoomList = computed(() => {
  if (!Array.isArray(roomList.value)) return [];
  //只显示30分钟内有动作的房间
  const activeRoom = roomList.value.filter((room) => Date.now() - 1000 * 60 * 30 < room.lastActive);
  const matchingRooms = activeRoom.filter((room) => room.isMatching && room.players[1] !== "训练用毛玉");
  const otherRooms = activeRoom.filter((room) => !room.isMatching && room.players[1] !== "训练用毛玉");
  const pracRooms = activeRoom.filter((room) => room.players[1] === "训练用毛玉");

  const sortDescByLastActive = (a, b) => b.lastActive - a.lastActive;

  matchingRooms.sort(sortDescByLastActive);
  otherRooms.sort(sortDescByLastActive);
  pracRooms.sort(sortDescByLastActive);

  if(localStore.userData.username !== "finale") {
    return [...matchingRooms, ...otherRooms].map((room) => ({
      ...room,
      playerA: room.players[0] || "",
      playerB: room.players[1] || "",
    }));
  }

  return [...matchingRooms, ...otherRooms, ...pracRooms].map((room) => ({
    ...room,
    playerA: room.players[0] || "",
    playerB: room.players[1] || "",
  }));
});

const getRoomList = async () => {
  try {
    roomList.value = await roomStore.getRoomList();
  } catch (error) {
    console.error("获取房间列表失败:", error);
    roomList.value = [];
  }
};

const getButtonType = (room) => {
  if (room.isMatching && room.playerB !== "训练用毛玉") {
    return "success";
  }
  //15分钟内没动作的房间视为已经不活跃
  const isActive = Date.now() - 1000 * 60 * 15 < room.lastActive;
  if (isActive && room.playerB !== "训练用毛玉") {
    return "primary";
  }
  return "info";
};

const joinRoom = (rid) => {
  emit("join-room", rid);
  visible.value = false;
};
</script>

<style scoped>
.dialog-content {
  height: 400px;
  overflow-y: auto;
}

.custom-table {
  width: 100%;
}

.custom-table-header,
.custom-table-row {
  display: flex;
  align-items: center;
  border-bottom: 1px solid #ebeef5;
  padding: 0 10px;
  height: 40px;
}

.custom-table-header {
  font-weight: bold;
  color: #909399;
  background-color: #fafafa;
  height: 40px;
  position: sticky;
  top: 0;
  z-index: 1;
}

.custom-table-row {
  height: 48px;
}

.custom-table-row:hover {
  background-color: #f5f7fa;
}

.header-cell,
.body-cell {
  padding: 0 10px;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.no-data {
  text-align: center;
  padding: 20px;
  color: #909399;
}
</style>
