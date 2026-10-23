<template>
  <el-dialog v-model="dialogVisible" title="自定义卡池" width="920px">
    <div class="pool-toolbar">
      <el-select
        v-model="selectedPoolId"
        size="small"
        class="pool-select"
        placeholder="选择自定义卡池"
        clearable
        @change="onSelectedPoolChange"
      >
        <el-option v-for="slot in availableSlots" :key="slot.id" :label="slotTitle(slot)" :value="slot.id" />
      </el-select>
      <el-select v-model="systemPoolVersion" size="small" class="version-select">
        <el-option v-for="item in Config.spellVersionList" :key="item.type" :label="item.name" :value="item.type" />
      </el-select>
      <el-button size="small" @click="downloadSystemPool">下载系统卡池</el-button>
      <el-button size="small" @click="downloadTemplate">下载模板</el-button>
    </div>

    <el-table :data="slotRows" size="small" border height="360">
      <el-table-column label="槽位" width="70">
        <template #default="{ row }">#{{ row.id + 1 }}</template>
      </el-table-column>
      <el-table-column label="文件" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ row.slot?.fileName || "空" }}</template>
      </el-table-column>
      <el-table-column label="数据" width="140">
        <template #default="{ row }">
          <span v-if="row.slot">{{ row.slot.payload.rows.length }} 条 / {{ gameCount(row.slot) }} 作品</span>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="备注" min-width="180">
        <template #default="{ row }">
          <el-input
            v-if="row.slot"
            v-model="row.slot.note"
            size="small"
            placeholder="备注"
            @change="poolStore.updateNote(row.id, row.slot.note)"
          />
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="150">
        <template #default="{ row }">{{ row.slot ? formatTime(row.slot.updatedAt) : "-" }}</template>
      </el-table-column>
      <el-table-column label="操作" width="420" fixed="right">
        <template #default="{ row }">
          <el-upload
            class="inline-upload"
            :auto-upload="false"
            :show-file-list="false"
            accept=".xlsx,.xls"
            :on-change="(file) => importSlot(row.id, file.raw)"
          >
            <el-button link type="primary" size="small">{{ row.slot ? "更新" : "新增" }}</el-button>
          </el-upload>
          <el-button link type="primary" size="small" :disabled="!row.slot" @click="previewSlot(row.id)">预览</el-button>
          <el-button link type="primary" size="small" :disabled="!row.slot" @click="poolStore.exportSlot(row.id)">导出</el-button>
          <el-button link type="primary" size="small" :disabled="!row.slot" @click="renameSlot(row.id)">重命名</el-button>
          <el-button link type="success" size="small" :disabled="!row.slot" @click="uploadToServer(row.id)">上传</el-button>
          <el-button link type="danger" size="small" :disabled="!row.slot" @click="deleteSlot(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <template #footer>
      <el-button @click="dialogVisible = false">关闭</el-button>
      <el-button type="primary" :disabled="!selectedSlot" @click="confirmSelected">使用选中卡池</el-button>
    </template>

    <CustomCardPoolPreviewDialog v-model:visible="previewVisible" :pool-slot="previewSlotData" />
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  ElButton,
  ElDialog,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
  ElUpload,
} from "element-plus";
import { useCustomCardPoolStore } from "@/store/CustomCardPoolStore";
import { useOnlineCustomPoolStore } from "@/store/OnlineCustomPoolStore";
import { CustomCardPoolSlot, customPoolToSpells, getCustomPoolGames, payloadToXlsxBase64 } from "@/utils/CustomCardPool";
import { useRoomStore } from "@/store/RoomStore";
import { WebSocketActionType } from "@/utils/webSocket/types";
import ws from "@/utils/webSocket/WebSocketBingo";
import pako from "pako";
import { exportCustomCardPool } from "@/utils/CustomCardPool";
import Config from "@/config";
import CustomCardPoolPreviewDialog from "@/components/CustomCardPoolPreviewDialog.vue";

const CUSTOM_CARD_POOL_TEMPLATE_URL = "/templates/custom-card-pool-template.xlsx";

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: "update:visible", value: boolean): void; (e: "selected"): void }>();

const poolStore = useCustomCardPoolStore();
const onlinePoolStore = useOnlineCustomPoolStore();
const roomStore = useRoomStore();
const dialogVisible = ref(false);
const previewSlotData = ref<CustomCardPoolSlot | null>(null);
const previewVisible = ref(false);
const systemPoolVersion = ref(roomStore.roomSettings.spell_version);
const selectedSlot = computed(() => poolStore.selectedSlot);
const slotRows = computed(() => poolStore.slots.map((slot, id) => ({ id, slot })));
const availableSlots = computed(() => poolStore.slots.filter((slot): slot is CustomCardPoolSlot => Boolean(slot)));
const selectedPoolId = computed<number | null>({
  get: () => poolStore.selectedId,
  set: (value) => poolStore.selectSlot(value),
});

watch(() => props.visible, (value) => {
  dialogVisible.value = value;
  if (value) systemPoolVersion.value = roomStore.roomSettings.spell_version;
});
watch(dialogVisible, (value) => emit("update:visible", value));

const slotTitle = (slot: CustomCardPoolSlot) => slot.note || slot.fileName || `槽位 ${slot.id + 1}`;
const gameCount = (slot: CustomCardPoolSlot) => getCustomPoolGames(slot.payload).length;
const formatTime = (value: number) => new Date(value).toLocaleString();

const importSlot = async (slotId: number, file?: File) => {
  if (!file) return;
  try {
    const slot = await poolStore.importFileToSlot(slotId, file);
    previewSlotData.value = slot;
    ElMessage.success("卡池已格式化并保存");
  } catch (e: any) {
    ElMessage.error(e?.message || "卡池导入失败");
  }
};

const previewSlot = (slotId: number) => {
  previewSlotData.value = poolStore.slots[slotId];
  previewVisible.value = Boolean(previewSlotData.value);
};

const onSelectedPoolChange = () => {
  applySelectedPoolToRoom();
  ElMessage.success("已选中自定义卡池");
};

const renameSlot = async (slotId: number) => {
  const slot = poolStore.slots[slotId];
  if (!slot) return;
  const { value } = await ElMessageBox.prompt("请输入新的卡池名称", "重命名卡池", {
    inputValue: slot.note || slot.fileName || "",
    inputPattern: /\S/,
    inputErrorMessage: "名称不能为空",
  });
  poolStore.updateNote(slotId, value.trim());
};

const deleteSlot = async (slotId: number) => {
  await ElMessageBox.confirm("确认删除该槽位中的卡池？", "删除卡池", { type: "warning" });
  poolStore.deleteSlot(slotId);
  if (previewSlotData.value?.id === slotId) {
    previewSlotData.value = null;
    previewVisible.value = false;
  }
  applySelectedPoolToRoom();
};

const applySelectedPoolToRoom = () => {
  roomStore.applyCustomCardPoolSelection();
  if (roomStore.roomId) roomStore.updateRoomConfig().catch(() => {});
};

const uploadToServer = async (slotId: number) => {
  const slot = poolStore.slots[slotId];
  if (!slot) return;
  try {
    const xlsxBase64 = payloadToXlsxBase64(slot.payload);
    const spells = customPoolToSpells(slot.payload);
    const games = getCustomPoolGames(slot.payload);
    await onlinePoolStore.uploadPool(slot.fileName, slot.note, xlsxBase64, JSON.stringify(spells), JSON.stringify(games));
    ElMessage.success("已上传到服务器");
  } catch (e: any) {
    ElMessage.error(e?.msg || e?.message || "上传失败");
  }
};

const confirmSelected = () => {
  applySelectedPoolToRoom();
  emit("selected");
  dialogVisible.value = false;
};

const downloadTemplate = () => {
  const link = document.createElement("a");
  link.href = CUSTOM_CARD_POOL_TEMPLATE_URL;
  link.download = "自定义卡池模板.xlsx";
  link.click();
};

const downloadSystemPool = async () => {
  try {
    const version = systemPoolVersion.value;
    const base64Data: string = await ws.send(WebSocketActionType.GET_XLSX_DATA, { id: version });
    const json = pako.ungzip(Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0)), { to: "string" });
    const gameMap = JSON.parse(json);
    const spells = Object.values(gameMap).flatMap((isExMap: any) =>
      Object.values(isExMap).flatMap((gameMap2: any) => Object.values(gameMap2).flatMap((list: any) => list))
    ) as any[];
    const payload = {
      rows: spells.map((spell, index) => ({
        index: index + 1,
        gameCode: Number(spell.game),
        gameName: configName(spell.game, version),
        name: spell.name,
        desc: spell.desc || "",
        rank: spell.rank,
        star: spell.star,
        bpStar: null,
        spellId: spell.id || index + 1,
      })),
    };
    const versionName = Config.spellVersionList.find((item: any) => item.type === version)?.name || "系统卡池";
    exportCustomCardPool(payload, `${versionName}.xlsx`);
  } catch (e: any) {
    ElMessage.error(e?.message || "系统卡池下载失败");
  }
};

const configName = (code: string, version: number) => {
  const item = Config.gameOptionList(version).find((game: any) => game.code === String(code));
  return item?.name || String(code);
};
</script>

<style scoped>
.pool-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.version-select {
  width: 140px;
}

.pool-select {
  width: 220px;
}

.inline-upload {
  display: inline-block;
}
</style>
