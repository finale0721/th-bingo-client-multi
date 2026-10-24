<template>
  <el-dialog v-model="dialogVisible" title="在线自定义卡池" width="960px" append-to-body>
    <div class="pool-toolbar">
      <el-upload
        class="inline-upload"
        :auto-upload="false"
        :show-file-list="false"
        accept=".xlsx,.xls"
        :on-change="(file) => handleUpload(file.raw)"
      >
        <el-button size="small" type="primary">上传卡池</el-button>
      </el-upload>
      <el-button size="small" @click="refreshList" :loading="onlineStore.loading">刷新</el-button>
    </div>

    <el-table :data="onlineStore.poolList" size="small" border height="400" v-loading="onlineStore.loading">
      <el-table-column prop="file_name" label="文件名" min-width="160" show-overflow-tooltip />
      <el-table-column prop="uploader_name" label="上传者" width="100" />
      <el-table-column label="备注" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.note || "-" }}</template>
      </el-table-column>
      <el-table-column label="数据" width="120">
        <template #default="{ row }">{{ row.row_count }} 条 / {{ row.game_count }} 作品</template>
      </el-table-column>
      <el-table-column label="上传时间" width="150">
        <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="过期时间" width="150">
        <template #default="{ row }">{{ formatTime(row.expires_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="previewPool(row)">预览</el-button>
          <el-button link type="primary" size="small" :loading="downloadingMd5s.has(row.md5)" @click="downloadPool(row)">下载</el-button>
          <el-button link type="danger" size="small" :disabled="row.uploader_name !== currentUserName" @click="deletePool(row.md5)">删除</el-button>
          <el-button link type="primary" size="small" @click="selectPool(row.md5)">使用</el-button>
        </template>
      </el-table-column>
    </el-table>

    <CustomCardPoolPreviewDialog v-model:visible="previewVisible" :pool-slot="previewSlotData" />
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  ElButton,
  ElDialog,
  ElMessage,
  ElMessageBox,
  ElTable,
  ElTableColumn,
  ElUpload,
  vLoading,
} from "element-plus";
import { useOnlineCustomPoolStore, OnlinePoolMetadata } from "@/store/OnlineCustomPoolStore";
import { useLocalStore } from "@/store/LocalStore";
import {
  CustomCardPoolPayload,
  CustomCardPoolSlot,
  customPoolToSpells,
  exportCustomCardPool,
  getCustomPoolGames,
  readCustomCardPoolFile,
} from "@/utils/CustomCardPool";
import { Spell } from "@/types";
import CustomCardPoolPreviewDialog from "@/components/CustomCardPoolPreviewDialog.vue";

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: "update:visible", value: boolean): void; (e: "selected"): void }>();

const onlineStore = useOnlineCustomPoolStore();
const localStore = useLocalStore();
const dialogVisible = ref(false);
const previewVisible = ref(false);
const previewSlotData = ref<CustomCardPoolSlot | null>(null);
const downloadingMd5s = ref(new Set<string>());

const currentUserName = computed(() => localStore.username);

watch(() => props.visible, (value) => {
  dialogVisible.value = value;
  if (value) onlineStore.fetchPoolList();
});
watch(dialogVisible, (value) => emit("update:visible", value));

const formatTime = (value: number) => new Date(value).toLocaleString();

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const spellsToPayload = (spells: Spell[]): CustomCardPoolPayload => ({
  rows: spells.map((spell, i) => ({
    index: i + 1,
    gameCode: Number(spell.game),
    gameName: spell.game,
    name: spell.name,
    desc: spell.desc || "",
    rank: spell.rank as "L" | "EX" | "PH",
    star: spell.star,
    bpStar: null,
    spellId: spell.id,
  })),
});

const makePreviewSlot = (metadata: OnlinePoolMetadata, spells: Spell[]): CustomCardPoolSlot => ({
  id: 0,
  note: metadata.note,
  fileName: metadata.file_name,
  updatedAt: metadata.created_at,
  payload: spellsToPayload(spells),
});

const refreshList = () => onlineStore.fetchPoolList();

const handleUpload = async (file?: File) => {
  if (!file) return;
  try {
    const payload = await readCustomCardPoolFile(file);
    const spells = customPoolToSpells(payload);
    const games = getCustomPoolGames(payload);
    const xlsxBase64 = await readFileAsBase64(file);
    await onlineStore.uploadPool(file.name, "", xlsxBase64, JSON.stringify(spells), JSON.stringify(games));
    ElMessage.success("上传成功");
    await onlineStore.fetchPoolList();
  } catch (e: any) {
    ElMessage.error(e?.msg || e?.message || "上传失败");
  }
};

const previewPool = async (meta: OnlinePoolMetadata) => {
  try {
    const spells = await onlineStore.getSpells(meta.md5);
    previewSlotData.value = makePreviewSlot(meta, spells);
    previewVisible.value = true;
  } catch (e: any) {
    ElMessage.error(e?.msg || e?.message || "加载失败");
  }
};

const downloadPool = async (meta: OnlinePoolMetadata) => {
  if (downloadingMd5s.value.has(meta.md5)) return;
  downloadingMd5s.value.add(meta.md5);
  try {
    const { metadata, spells } = await onlineStore.fetchPoolDetail(meta.md5);
    const payload = spellsToPayload(spells);
    const gameNames = new Map(metadata.games.map((game) => [String(game.code), game.name]));
    payload.rows.forEach((row) => {
      row.gameName = gameNames.get(String(row.gameCode)) || row.gameName;
    });
    const fileName = (metadata.file_name || "自定义卡池").replace(/\.xlsx?$/i, "");
    exportCustomCardPool(payload, `${fileName}.xlsx`);
  } catch (e: any) {
    ElMessage.error(e?.msg || e?.message || "下载失败");
  } finally {
    downloadingMd5s.value.delete(meta.md5);
  }
};

const deletePool = async (md5: string) => {
  try {
    await ElMessageBox.confirm("确认删除该卡池？", "删除卡池", { type: "warning" });
    await onlineStore.deletePool(md5);
    ElMessage.success("已删除");
  } catch (e: any) {
    if (e?.msg) ElMessage.error(e.msg);
  }
};

const selectPool = (md5: string) => {
  onlineStore.selectPool(md5);
  emit("selected");
  dialogVisible.value = false;
};
</script>

<style scoped>
.pool-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.inline-upload {
  display: inline-block;
}
</style>
