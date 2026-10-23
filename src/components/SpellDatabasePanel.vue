<template>
  <div
    v-if="editorStore.isDatabasePanelVisible"
    class="database-window"
    :style="{ left: `${windowPosition.x}px`, top: `${windowPosition.y}px` }"
  >
    <div class="window-header" @mousedown="startDrag">
      <span class="title">符卡数据库查询</span>
      <el-icon class="close-btn" @mousedown.stop @click="editorStore.toggleDatabasePanel"><Close /></el-icon>
    </div>

    <div class="window-body">
      <div class="control-bar">
        <el-radio-group v-model="activeTab" size="small">
          <el-radio-button label="local">收藏夹</el-radio-button>
          <el-radio-button label="customPool">自定义卡池</el-radio-button>
          <el-radio-button label="onlinePool">在线卡池</el-radio-button>
          <el-radio-button label="server">服务器库</el-radio-button>
        </el-radio-group>
        <el-button v-if="activeTab === 'local'" size="small" type="success" @click="openDbDialog('create')">
          新建
        </el-button>
        <template v-if="activeTab === 'customPool'">
          <el-select v-model="customPoolSlotId" size="small" style="width: 180px" placeholder="选择自定义卡池">
            <el-option
              v-for="item in customPoolOptions"
              :key="item.id"
              :label="item.label"
              :value="item.id"
            />
          </el-select>
        </template>
        <template v-if="activeTab === 'onlinePool'">
          <el-select v-model="onlinePoolMd5" size="small" style="width: 240px" placeholder="选择在线卡池" clearable>
            <el-option
              v-for="item in onlinePoolOptions"
              :key="item.md5"
              :label="item.label"
              :value="item.md5"
            />
          </el-select>
          <el-button size="small" type="primary" :loading="onlineCustomPoolStore.loading" @click="onlineCustomPoolStore.fetchPoolList()">
            刷新列表
          </el-button>
        </template>
        <template v-if="activeTab === 'server'">
          <el-select v-model="roomStore.roomConfig.spell_version" size="small" style="width: 120px">
            <el-option v-for="item in Config.spellVersionList" :key="item.type" :label="item.name" :value="item.type" />
          </el-select>
          <el-button size="small" type="primary" :loading="editorStore.isFetchingServerData" @click="handleFetchServer">
            请求
          </el-button>
        </template>
      </div>

      <div class="filter-bar">
        <el-input v-model="filters.game" placeholder="作品" size="small" clearable />
        <el-input v-model="filters.name" placeholder="名称" size="small" clearable />
        <el-input v-model="filters.rank" placeholder="分类" size="small" clearable />
        <el-input v-model="filters.desc" placeholder="描述" size="small" clearable />
        <el-input-number v-model="filters.star" :min="0" :max="7" size="small" controls-position="right" />
        <el-button size="small" @click="clearFilters">重置</el-button>
      </div>

      <el-table :data="paginatedSpells" size="small" border stripe height="470" v-loading="onlinePoolLoading" @sort-change="handleSortChange">
        <el-table-column prop="game" label="作品" width="80" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="name" label="符卡名" min-width="170" sortable="custom" show-overflow-tooltip />
        <el-table-column prop="rank" label="分类" width="70" sortable="custom" />
        <el-table-column prop="star" label="评级" width="70" sortable="custom" align="center" />
        <el-table-column prop="desc" label="描述" min-width="120" sortable="custom" show-overflow-tooltip />
        <el-table-column label="操作" width="150" fixed="right" align="center">
          <template #default="scope">
            <el-button link size="small" type="primary" @click="handleUse(scope.row)">填入</el-button>
            <template v-if="activeTab === 'local'">
              <el-button link size="small" type="warning" @click="openDbDialog('edit', scope.row)">编辑</el-button>
              <el-button link size="small" type="danger" @click="handleDelete(scope.row)">删除</el-button>
            </template>
            <el-button v-else link size="small" type="success" @click="handleImportToLocal(scope.row)">收藏</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[12, 25, 50, 100]"
        layout="total, sizes, prev, pager, next"
        :total="filteredSpells.length"
        small
        background
      />
    </div>

    <el-dialog v-model="dbDialogVisible" :title="dbDialogMode === 'create' ? '新建收藏' : '编辑收藏'" width="420px" append-to-body>
      <el-form :model="dbForm" label-width="70px">
        <el-form-item label="名称" required><el-input v-model="dbForm.name" /></el-form-item>
        <el-form-item label="作品"><el-input v-model="dbForm.game" /></el-form-item>
        <el-form-item label="分类"><el-input v-model="dbForm.rank" /></el-form-item>
        <el-form-item label="评级"><el-input-number v-model="dbForm.star" :min="1" :max="7" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="dbForm.desc" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dbDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveDbSpell">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import {
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElIcon,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElOption,
  ElPagination,
  ElRadioButton,
  ElRadioGroup,
  ElSelect,
  ElTable,
  ElTableColumn,
} from "element-plus";
import { Close } from "@element-plus/icons-vue";
import { useRoomStore } from "@/store/RoomStore";
import { useEditorStore } from "@/store/EditorStore";
import { useCustomCardPoolStore } from "@/store/CustomCardPoolStore";
import { useOnlineCustomPoolStore } from "@/store/OnlineCustomPoolStore";
import { customPoolToSpells } from "@/utils/CustomCardPool";
import { Spell } from "@/types";
import Config from "@/config";

const roomStore = useRoomStore();
const editorStore = useEditorStore();
const customCardPoolStore = useCustomCardPoolStore();
const onlineCustomPoolStore = useOnlineCustomPoolStore();
const activeTab = ref<"local" | "customPool" | "server" | "onlinePool">("local");
const currentPage = ref(1);
const pageSize = ref(12);
const sortState = reactive({ prop: "", order: "" });
const filters = reactive({ name: "", game: "", rank: "", star: 0, desc: "" });
const customPoolSlotId = ref<number | null>(customCardPoolStore.selectedId);
const windowPosition = reactive({ x: Math.max(window.innerWidth - 760, 20), y: 90 });
const dragState = reactive({ dragging: false, offsetX: 0, offsetY: 0 });

watch(activeTab, () => (currentPage.value = 1));

const customPoolOptions = computed(() =>
  customCardPoolStore.slots
    .map((slot, id) => slot ? { id, label: slot.note || slot.fileName || `槽位 ${id + 1}` } : null)
    .filter((item): item is { id: number; label: string } => Boolean(item))
);

watch(customPoolOptions, (options) => {
  if (customPoolSlotId.value != null && options.some((item) => item.id === customPoolSlotId.value)) return;
  customPoolSlotId.value = options[0]?.id ?? null;
}, { immediate: true });

watch(customPoolSlotId, () => (currentPage.value = 1));

const onlinePoolMd5 = ref<string | null>(null);
const onlinePoolSpellCache = ref<Map<string, Spell[]>>(new Map());
const onlinePoolLoading = ref(false);

const onlinePoolOptions = computed(() =>
  onlineCustomPoolStore.poolList.map((p) => ({
    md5: p.md5,
    label: `${p.file_name} (${p.row_count}条/${p.uploader_name})`,
  }))
);

watch(activeTab, (tab) => {
  if (tab === "onlinePool" && onlineCustomPoolStore.poolList.length === 0) {
    onlineCustomPoolStore.fetchPoolList();
  }
});

watch(() => onlineCustomPoolStore.poolList, (list) => {
  if (onlinePoolMd5.value && !list.some((p) => p.md5 === onlinePoolMd5.value)) {
    onlinePoolMd5.value = list[0]?.md5 ?? null;
  }
});

watch(onlinePoolMd5, async (md5) => {
  currentPage.value = 1;
  if (!md5 || onlinePoolSpellCache.value.has(md5)) return;
  onlinePoolLoading.value = true;
  try {
    const spells = await onlineCustomPoolStore.getSpells(md5);
    onlinePoolSpellCache.value.set(md5, spells);
  } catch (e: any) {
    ElMessage.error(e?.msg || e?.message || "加载在线卡池失败");
  } finally {
    onlinePoolLoading.value = false;
  }
});

const currentSource = computed(() => {
  if (activeTab.value === "local") return editorStore.localSpellDatabase;
  if (activeTab.value === "customPool") {
    const slot = customPoolSlotId.value == null ? null : customCardPoolStore.slots[customPoolSlotId.value];
    return slot ? customPoolToSpells(slot.payload, false) : [];
  }
  if (activeTab.value === "onlinePool") {
    if (!onlinePoolMd5.value) return [];
    return onlinePoolSpellCache.value.get(onlinePoolMd5.value) || [];
  }
  const version = roomStore.roomConfig.spell_version;
  const cache = editorStore.serverSpellCache.get(version);
  return cache && Date.now() - cache.timestamp < 3 * 60 * 60 * 1000 ? cache.data : [];
});

const filteredSpells = computed(() =>
  currentSource.value.filter((spell) => {
    if (!spell) return false;
    return (
      (!filters.name || spell.name?.toLowerCase().includes(filters.name.toLowerCase())) &&
      (!filters.game || spell.game?.toLowerCase().includes(filters.game.toLowerCase())) &&
      (!filters.rank || spell.rank?.toLowerCase().includes(filters.rank.toLowerCase())) &&
      (!filters.desc || spell.desc?.toLowerCase().includes(filters.desc.toLowerCase())) &&
      (filters.star === 0 || spell.star === filters.star)
    );
  })
);

const sortedSpells = computed(() => {
  if (!sortState.prop || !sortState.order) return filteredSpells.value;
  const multiplier = sortState.order === "descending" ? -1 : 1;
  return [...filteredSpells.value].sort((a, b) => {
    const av = a[sortState.prop as keyof Spell];
    const bv = b[sortState.prop as keyof Spell];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * multiplier;
    return String(av || "").localeCompare(String(bv || "")) * multiplier;
  });
});

const paginatedSpells = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return sortedSpells.value.slice(start, start + pageSize.value);
});

const clearFilters = () => {
  filters.name = "";
  filters.game = "";
  filters.rank = "";
  filters.star = 0;
  filters.desc = "";
};

const handleSortChange = ({ prop, order }: any) => {
  sortState.prop = prop || "";
  sortState.order = order || "";
};

const handleFetchServer = () => editorStore.fetchServerSpells(roomStore.roomConfig.spell_version);

const handleUse = (spell: Spell) => {
  if (editorStore.selectedSpellIndex === -1) {
    ElMessage.warning("请先在盘面上选中一个格子");
    return;
  }
  editorStore.applySpellFromDatabase(spell);
};

const handleDelete = (spell: Spell) => editorStore.deleteFromLocalDatabase(spell);
const handleImportToLocal = (spell: Spell) => {
  editorStore.saveToLocalDatabase(spell) ? ElMessage.success("已收藏") : ElMessage.warning("收藏夹已存在该符卡");
};

const dbDialogVisible = ref(false);
const dbDialogMode = ref<"create" | "edit">("create");
const editingSpellOriginal = ref<Spell | null>(null);
const dbForm = reactive({ name: "", game: "", rank: "", star: 1, desc: "" });

const openDbDialog = (mode: "create" | "edit", spell?: Spell) => {
  dbDialogMode.value = mode;
  editingSpellOriginal.value = spell || null;
  dbForm.name = spell?.name || "";
  dbForm.game = spell?.game || "";
  dbForm.rank = spell?.rank || "";
  dbForm.star = spell?.star || 1;
  dbForm.desc = spell?.desc || "";
  dbDialogVisible.value = true;
};

const saveDbSpell = () => {
  if (!dbForm.name) {
    ElMessage.warning("名称不能为空");
    return;
  }
  const spellData: Spell = {
    index: 0,
    name: dbForm.name,
    game: dbForm.game,
    rank: dbForm.rank,
    star: dbForm.star,
    desc: dbForm.desc,
    id: 0,
    fastest: 0,
    miss_time: 0,
    power_weight: 0,
    difficulty: 0,
    change_rate: 0,
    max_cap_rate: 0,
  };
  if (dbDialogMode.value === "create") {
    handleImportToLocal(spellData);
  } else if (editingSpellOriginal.value) {
    const index = editorStore.localSpellDatabase.indexOf(editingSpellOriginal.value);
    editorStore.updateLocalDatabaseSpell(index, spellData);
  }
  dbDialogVisible.value = false;
};

const startDrag = (event: MouseEvent) => {
  dragState.dragging = true;
  dragState.offsetX = event.clientX - windowPosition.x;
  dragState.offsetY = event.clientY - windowPosition.y;
  document.addEventListener("mousemove", handleDrag);
  document.addEventListener("mouseup", stopDrag);
};

const handleDrag = (event: MouseEvent) => {
  if (!dragState.dragging) return;
  windowPosition.x = Math.min(Math.max(event.clientX - dragState.offsetX, 0), window.innerWidth - 320);
  windowPosition.y = Math.min(Math.max(event.clientY - dragState.offsetY, 0), window.innerHeight - 120);
};

const stopDrag = () => {
  dragState.dragging = false;
  document.removeEventListener("mousemove", handleDrag);
  document.removeEventListener("mouseup", stopDrag);
};

onBeforeUnmount(stopDrag);
</script>

<style scoped>
.database-window {
  position: fixed;
  width: 760px;
  height: 640px;
  z-index: 200;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 0 15px rgba(0, 0, 0, 0.22);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.window-header {
  height: 36px;
  padding: 0 12px;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #dcdfe6;
  cursor: move;
  user-select: none;
}

.title {
  font-weight: 600;
}

.close-btn {
  cursor: pointer;
}

.window-body {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-bar,
.filter-bar {
  display: flex;
  align-items: center;
  gap: 6px;
}

.filter-bar .el-input {
  width: 112px;
}
</style>
