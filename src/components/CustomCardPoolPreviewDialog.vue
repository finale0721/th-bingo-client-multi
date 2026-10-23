<template>
  <el-dialog v-model="dialogVisible" :title="title" width="780px" append-to-body>
    <div class="control-bar">
      <el-input v-model="filters.game" placeholder="作品" size="small" clearable />
      <el-input v-model="filters.name" placeholder="名称" size="small" clearable />
      <el-input v-model="filters.rank" placeholder="分类" size="small" clearable />
      <el-input v-model="filters.desc" placeholder="描述" size="small" clearable />
      <el-input-number v-model="filters.star" :min="0" :max="7" size="small" controls-position="right" />
      <el-button size="small" @click="clearFilters">重置</el-button>
    </div>

    <el-table :data="paginatedSpells" size="small" border stripe height="420" @sort-change="handleSortChange">
      <el-table-column prop="game" label="作品" width="80" sortable="custom" show-overflow-tooltip />
      <el-table-column prop="name" label="符卡名" min-width="170" sortable="custom" show-overflow-tooltip />
      <el-table-column prop="rank" label="分类" width="70" sortable="custom" />
      <el-table-column prop="star" label="评级" width="70" sortable="custom" align="center" />
      <el-table-column prop="desc" label="描述" min-width="140" sortable="custom" show-overflow-tooltip />
      <el-table-column prop="id" label="编号" width="80" sortable="custom" align="center" />
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
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import {
  ElButton,
  ElDialog,
  ElInput,
  ElInputNumber,
  ElPagination,
  ElTable,
  ElTableColumn,
} from "element-plus";
import { CustomCardPoolSlot, customPoolToSpells } from "@/utils/CustomCardPool";
import { Spell } from "@/types";

const props = defineProps<{ visible: boolean; poolSlot: CustomCardPoolSlot | null }>();
const emit = defineEmits<{ (e: "update:visible", value: boolean): void }>();

const dialogVisible = ref(false);
const currentPage = ref(1);
const pageSize = ref(12);
const sortState = reactive({ prop: "", order: "" });
const filters = reactive({ name: "", game: "", rank: "", star: 0, desc: "" });

watch(() => props.visible, (value) => (dialogVisible.value = value));
watch(dialogVisible, (value) => emit("update:visible", value));
watch(() => props.poolSlot?.id, () => {
  currentPage.value = 1;
  clearFilters();
});

const title = computed(() => {
  const slot = props.poolSlot;
  if (!slot) return "卡池预览";
  return `卡池预览：${slot.note || slot.fileName || `槽位 ${slot.id + 1}`}`;
});

const spells = computed(() => (props.poolSlot ? customPoolToSpells(props.poolSlot.payload, false) : []));

const filteredSpells = computed(() =>
  spells.value.filter((spell) => {
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
</script>

<style scoped>
.control-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.control-bar .el-input {
  width: 118px;
}

.el-pagination {
  margin-top: 8px;
}
</style>
