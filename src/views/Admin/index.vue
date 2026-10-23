<template>
  <div class="admin-page">
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">TFCC Replay Archive</p>
        <h1>对局数据与活跃分析后台</h1>
        <p class="desc">
          查询持久化对局、分析站点与用户活跃情况、预览可读文件，并在详情中直接进行回放。
        </p>
        <div class="hero-meta">
          <span>管理员 {{ adminStore.username }}</span>
          <span>当前 {{ records.length }} 条记录</span>
          <span>已选 {{ selectedRows.length }} 条</span>
        </div>
      </div>
      <div class="hero-actions">
        <el-button :loading="loading" @click="loadDashboard">刷新</el-button>
        <el-button
          type="primary"
          plain
          :disabled="!currentReplayableIds.length"
          :loading="exporting"
          @click="exportReadableLogs('current')"
        >
          导出当前筛选
        </el-button>
        <el-button
          type="primary"
          :disabled="!selectedReplayableIds.length"
          :loading="exporting"
          @click="exportReadableLogs('selected')"
        >
          导出已选 {{ selectedReplayableIds.length }} 条
        </el-button>
        <el-button @click="logout">退出</el-button>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>查询条件</h2>
          <p>分析卡片、列表和详情都会跟随当前筛选同步更新。</p>
        </div>
      </div>
      <el-form inline>
        <el-form-item label="关键词">
          <el-input v-model="filters.keyword" placeholder="房间号 / 玩家名" clearable @keyup.enter="loadDashboard" />
        </el-form-item>
        <el-form-item label="保存原因">
          <el-select v-model="filters.saveReason" clearable placeholder="全部">
            <el-option label="对局结束" value="game_finished" />
            <el-option label="房间清理前快照" value="room_cleanup" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="dateRange"
            type="datetimerange"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            value-format="x"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="loadDashboard">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section class="metrics">
      <article class="metric accent">
        <span>对局记录</span>
        <strong>{{ overview.total_records }}</strong>
        <small>当前筛选结果</small>
      </article>
      <article class="metric">
        <span>可回放记录</span>
        <strong>{{ overview.replayable_records }}</strong>
        <small>支持导出可读文件</small>
      </article>
      <article class="metric">
        <span>独立用户</span>
        <strong>{{ overview.unique_players }}</strong>
        <small>已排除训练用毛玉</small>
      </article>
      <article class="metric">
        <span>活跃天数</span>
        <strong>{{ overview.active_days }}</strong>
        <small>按落盘日期统计</small>
      </article>
      <article class="metric">
        <span>平均时长</span>
        <strong>{{ formatDuration(overview.average_duration_ms) }}</strong>
        <small>仅统计有效时长</small>
      </article>
      <article class="metric">
        <span>人均对局</span>
        <strong>{{ formatDecimal(overview.average_matches_per_user) }}</strong>
        <small>单日均 {{ formatDecimal(overview.average_records_per_day) }} 条</small>
      </article>
    </section>

    <section class="analytics">
      <article class="panel" v-loading="analyticsLoading">
        <div class="panel-head">
          <div>
            <h2>站点活跃走势</h2>
            <p>最近活跃日期的记录量与参与人数。</p>
          </div>
        </div>
        <el-empty v-if="!dailyBars.length" description="暂无数据" />
        <div v-else class="bars">
          <div v-for="item in dailyBars" :key="item.date" class="bar-col">
            <div class="bar-box">
              <span class="bar" :style="{ height: `${item.recordHeight}%` }" />
            </div>
            <strong>{{ item.record_count }}</strong>
            <small>{{ item.unique_players }} 人</small>
            <span>{{ item.label }}</span>
          </div>
        </div>
      </article>

      <article class="panel" v-loading="analyticsLoading">
        <div class="panel-head">
          <div>
            <h2>用户活跃榜</h2>
            <p>按对局量排序，展示回放数、胜率与平均时长。</p>
          </div>
        </div>
        <el-empty v-if="!topUsers.length" description="暂无数据" />
        <div v-else class="list">
          <div v-for="user in topUsers" :key="user.player_name" class="list-row">
            <div>
              <strong>{{ user.player_name }}</strong>
              <small>{{ user.match_count }} 局 · {{ user.active_days }} 天活跃 · 可回放 {{ user.replayable_count }}</small>
            </div>
            <div class="user-side">
              <small>胜率 {{ formatRate(user.win_rate) }}</small>
              <small>均时 {{ formatDuration(user.average_duration_ms) }}</small>
            </div>
          </div>
        </div>
      </article>

      <article class="panel" v-loading="analyticsLoading">
        <div class="panel-head">
          <div>
            <h2>结构分布</h2>
            <p>按月份、保存原因和模式查看归档情况。</p>
          </div>
        </div>
        <div class="distribution">
          <div>
            <h3>月份归档</h3>
            <div v-for="item in overview.month_distribution" :key="`m-${item.label}`" class="dist-row">
              <span>{{ item.label }}</span>
              <strong>{{ item.count }}</strong>
            </div>
          </div>
          <div>
            <h3>保存原因</h3>
            <div v-for="item in overview.save_reason_distribution" :key="`r-${item.label}`" class="dist-row">
              <span>{{ saveReasonLabel(item.label) }}</span>
              <strong>{{ item.count }}</strong>
            </div>
          </div>
          <div>
            <h3>模式分布</h3>
            <div v-for="item in overview.game_type_distribution" :key="`t-${item.label}`" class="dist-row">
              <span>{{ item.label }}</span>
              <strong>{{ item.count }}</strong>
            </div>
          </div>
        </div>
      </article>
    </section>

    <section class="panel">
      <div class="panel-head table-head">
        <div>
          <h2>对局记录</h2>
          <p>支持多选后批量导出 ZIP，压缩包内文件名与单条可读文件导出保持一致。</p>
        </div>
        <div class="inline-actions">
          <el-button :disabled="!selectedRows.length" @click="clearSelection">清空选择</el-button>
          <el-button
            type="primary"
            plain
            :disabled="!selectedReplayableIds.length"
            :loading="exporting"
            @click="exportReadableLogs('selected')"
          >
            批量导出已选
          </el-button>
        </div>
      </div>
      <el-table
        ref="tableRef"
        :data="pagedRecords"
        row-key="id"
        empty-text="暂无记录"
        v-loading="loading"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="54" :reserve-selection="true" />
        <el-table-column label="保存时间" min-width="180">
          <template #default="{ row }">{{ formatDate(row.saved_at) }}</template>
        </el-table-column>
        <el-table-column label="归档月份" min-width="110">
          <template #default="{ row }">
            <el-tag effect="plain">{{ row.storage_month || "-" }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="room_id" label="房间" min-width="110" />
        <el-table-column label="玩家" min-width="220">
          <template #default="{ row }">{{ formatPlayers(row.players) }}</template>
        </el-table-column>
        <el-table-column label="保存原因" min-width="130">
          <template #default="{ row }">
            <el-tag :type="row.save_reason === 'game_finished' ? 'success' : 'warning'">
              {{ saveReasonLabel(row.save_reason) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="game_type_name" label="模式" min-width="110" />
        <el-table-column label="盘面" min-width="80">
          <template #default="{ row }">{{ (row.board_size || 5) + '×' + (row.board_size || 5) }}</template>
        </el-table-column>
        <el-table-column label="局内比分" min-width="100">
          <template #default="{ row }">{{ formatScore(row.score) }}</template>
        </el-table-column>
        <el-table-column label="时长" min-width="100">
          <template #default="{ row }">{{ formatDuration(row.duration_ms) }}</template>
        </el-table-column>
        <el-table-column label="回放" min-width="90">
          <template #default="{ row }">
            <el-tag :type="row.has_game_log ? 'primary' : 'info'">
              {{ row.has_game_log ? "可导出" : "快照" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="详情" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row.id)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-pagination">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="pageSizes"
          :total="records.length"
          layout="total, sizes, prev, pager, next, jumper"
          background
          small
          @current-change="handlePageChange"
          @size-change="handlePageSizeChange"
        />
      </div>
    </section>

    <el-drawer
      v-model="detailVisible"
      size="90%"
      :title="selectedRecord ? `记录 ${selectedRecord.room_id}` : '记录详情'"
    >
      <div class="detail" v-loading="detailLoading">
        <template v-if="selectedRecord">
          <div class="inline-actions detail-actions">
            <el-button type="primary" :disabled="!selectedRecord.game_log" @click="exportReadableLog">导出当前可读文件</el-button>
            <el-button :disabled="!selectedReadablePreview" @click="copyReadablePreview">复制可读文件预览</el-button>
            <el-button :disabled="!selectedReadableFull" @click="copyReplayCode">复制 Replay</el-button>
            <el-button :disabled="!selectedReadableFull" @click="showReplayCode">查看 Replay</el-button>
          </div>

          <el-descriptions :column="3" border class="summary">
            <el-descriptions-item label="保存时间">{{ formatDate(selectedRecord.saved_at) }}</el-descriptions-item>
            <el-descriptions-item label="归档月份">{{ selectedRecord.storage_month || "-" }}</el-descriptions-item>
            <el-descriptions-item label="开始时间">{{ formatDate(selectedRecord.started_at) }}</el-descriptions-item>
            <el-descriptions-item label="玩家">{{ formatPlayers(selectedRecord.players) }}</el-descriptions-item>
            <el-descriptions-item label="模式">{{ selectedRecord.game_type_name }}</el-descriptions-item>
            <el-descriptions-item label="保存原因">{{ saveReasonLabel(selectedRecord.save_reason) }}</el-descriptions-item>
            <el-descriptions-item label="局内比分">{{ formatScore(selectedRecord.score) }}</el-descriptions-item>
            <el-descriptions-item label="动作数">{{ selectedRecord.action_count }}</el-descriptions-item>
            <el-descriptions-item label="胜者">{{ selectedRecord.round_winner_name || "-" }}</el-descriptions-item>
          </el-descriptions>

          <div class="detail-stack">
            <section class="detail-card replay-card">
              <div class="panel-head">
                <div>
                  <h2>回放播放器</h2>
                  <p>按时间轴回放动作，点击左侧动作摘要也可跳转到对应时间点。</p>
                </div>
              </div>
              <admin-replay-player ref="replayPlayerRef" :game-log="selectedRecord.game_log" />
            </section>

            <div class="detail-grid">
              <section class="detail-card">
                <div class="panel-head">
                  <div>
                    <h2>动作摘要</h2>
                    <p>{{ actionPreview.length }} / {{ selectedRecord.action_count }}</p>
                  </div>
                </div>
                <el-empty v-if="!actionPreview.length" description="暂无动作摘要" />
                <div v-else class="list action-list">
                  <button
                    v-for="(action, index) in actionPreview"
                    :key="`${action.playerName}-${action.timestamp}-${index}`"
                    class="list-row action-row"
                    type="button"
                    @click="jumpToAction(action.timestamp)"
                  >
                    <strong>{{ formatDuration(action.timestamp) }}</strong>
                    <small>{{ action.playerName || "-" }} / {{ actionTypeLabel(action.actionType) }} / {{ action.spellName || "-" }}</small>
                  </button>
                </div>
              </section>

              <section class="detail-card preview-card">
                <div class="panel-head">
                  <div>
                    <h2>可读文件预览</h2>
                    <p v-if="selectedReadablePreview">{{ selectedReadablePreview.fileName }}</p>
                  </div>
                </div>
                <el-empty v-if="!selectedReadablePreview" description="当前记录没有可导出的回放" />
                <pre v-else class="preview">{{ selectedReadablePreview.content }}</pre>
              </section>
            </div>
          </div>
        </template>
      </div>
    </el-drawer>

    <el-dialog v-model="replayDialogVisible" width="720px" title="Replay 代码">
      <el-input v-model="replayCode" type="textarea" :rows="18" readonly />
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import type { TableInstance } from "element-plus";
import {
  ElButton,
  ElDatePicker,
  ElDescriptions,
  ElDescriptionsItem,
  ElDialog,
  ElDrawer,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
} from "element-plus";
import AdminReplayPlayer from "@/components/AdminReplayPlayer.vue";
import { useAdminStore } from "@/store/AdminStore";
import type { AdminGameRecord, AdminGameRecordSummary, AdminUserOverviewResponse } from "@/types/admin";
import adminApi, { type MatchQuery } from "@/utils/adminApi";
import Replay, { type ReadableLogBuildResult } from "@/utils/Replay";
import createZipArchive, { type ZipFileEntry } from "@/utils/ZipArchive";

type ReplayPlayerExpose = {
  seekTo: (time: number) => void;
  reset: () => void;
};

const router = useRouter();
const adminStore = useAdminStore();

const tableRef = ref<TableInstance>();
const replayPlayerRef = ref<ReplayPlayerExpose | null>(null);
const loading = ref(false);
const analyticsLoading = ref(false);
const detailLoading = ref(false);
const exporting = ref(false);
const detailVisible = ref(false);
const replayDialogVisible = ref(false);
const replayCode = ref("");
const dateRange = ref<string[]>([]);
const records = ref<AdminGameRecordSummary[]>([]);
const selectedRows = ref<AdminGameRecordSummary[]>([]);
const currentPage = ref(1);
const pageSize = ref(20);
const pageSizes = [20, 50, 100];
const selectedRecord = ref<AdminGameRecord | null>(null);
const analytics = ref<AdminUserOverviewResponse | null>(null);
const filters = reactive({
  keyword: "",
  saveReason: "",
});

const defaultOverview: AdminUserOverviewResponse = {
  total_records: 0,
  replayable_records: 0,
  finished_matches: 0,
  unique_players: 0,
  active_days: 0,
  average_duration_ms: 0,
  average_records_per_day: 0,
  average_matches_per_user: 0,
  top_active_users: [],
  daily_activity: [],
  month_distribution: [],
  save_reason_distribution: [],
  game_type_distribution: [],
};

const overview = computed(() => analytics.value || defaultOverview);
const selectedReadablePreview = computed<ReadableLogBuildResult | null>(() =>
  selectedRecord.value?.game_log ? Replay.buildReadablePreviewContent(selectedRecord.value.game_log) : null
);
const selectedReadableFull = computed<ReadableLogBuildResult | null>(() =>
  selectedRecord.value?.game_log ? Replay.buildReadableLogContent(selectedRecord.value.game_log) : null
);
const actionPreview = computed(() =>
  (selectedRecord.value?.game_log?.actions || [])
    .map((action, index) => ({ action, index }))
    .sort((a, b) => a.action.timestamp - b.action.timestamp || a.index - b.index)
    .map((item) => item.action)
);
const topUsers = computed(() => overview.value.top_active_users.slice(0, 12));
const currentReplayableIds = computed(() => records.value.filter((item) => item.has_game_log).map((item) => item.id));
const selectedReplayableIds = computed(() => selectedRows.value.filter((item) => item.has_game_log).map((item) => item.id));
const pagedRecords = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return records.value.slice(start, end);
});
const dailyBars = computed(() => {
  const items = overview.value.daily_activity;
  const max = Math.max(...items.map((item) => item.record_count), 1);
  return items.map((item) => ({
    ...item,
    label: item.date.slice(5),
    recordHeight: Math.max(12, Math.round((item.record_count / max) * 100)),
  }));
});

const formatDate = (timestamp?: number | null) => (timestamp ? new Date(timestamp).toLocaleString() : "-");
const formatPlayers = (players: string[]) => players.filter(Boolean).join(" vs ") || "-";
const formatScore = (score?: number[] | null) => `${score?.[0] ?? 0} - ${score?.[1] ?? 0}`;
const formatDecimal = (value?: number | null) => (value ? value.toFixed(1) : "0.0");
const formatRate = (value?: number | null) => `${(((value || 0) * 100).toFixed(1))}%`;
const saveReasonLabel = (reason: string) => {
  if (reason === "game_finished") return "对局结束";
  if (reason === "room_cleanup") return "房间清理前快照";
  return reason || "-";
};
const actionTypeLabel = (actionType: string) => {
  if (actionType === "select") return "选择符卡";
  if (actionType === "finish") return "收取符卡";
  if (actionType === "contest_win") return "抢卡成功";
  if (actionType === "pause") return "暂停比赛";
  if (actionType === "resume") return "恢复比赛";
  if (actionType.startsWith("set-")) {
    const status = Number(actionType.split("-")[1] || 0);
    switch (status) {
      case 0:
        return "重置状态";
      case 1:
        return "设置为左侧已选";
      case 2:
        return "设置为双方已选";
      case 3:
        return "设置为右侧已选";
      case 5:
        return "设置为左侧收取";
      case 6:
        return "设置为双方收取";
      case 7:
        return "设置为右侧收取";
      case -1:
        return "设置为禁用";
      case 0x1000:
        return "设置为双方隐藏";
      case 0x1010:
        return "设置为仅显示作品";
      case 0x1011:
        return "设置为仅显示作品面";
      case 0x1012:
        return "设置为仅显示星级";
      default:
        return `设置状态 ${status}`;
    }
  }
  return actionType;
};

const formatDuration = (durationMs?: number | null) => {
  if (!durationMs) {
    return "00:00";
  }
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const buildQuery = (): MatchQuery => {
  const query: MatchQuery = { limit: 400 };
  if (filters.keyword.trim()) {
    query.keyword = filters.keyword.trim();
  }
  if (filters.saveReason) {
    query.save_reason = filters.saveReason;
  }
  if (dateRange.value.length === 2) {
    query.from = Number(dateRange.value[0]);
    query.to = Number(dateRange.value[1]);
  }
  return query;
};

const handleApiError = (error: unknown) => {
  const err = error as Error & { code?: number };
  if (err.code === 401) {
    adminStore.handleUnauthorized();
    router.push("/admin/login");
    ElMessage.error("管理员登录已失效，请重新登录");
    return;
  }
  ElMessage.error(err.message || "请求失败");
};

const loadDashboard = async () => {
  const query = buildQuery();
  loading.value = true;
  analyticsLoading.value = true;
  try {
    const [matchResponse, overviewResponse] = await Promise.all([
      adminApi.getMatches(query, adminStore.token),
      adminApi.getUserOverview(query, adminStore.token),
    ]);
    records.value = matchResponse.items;
    analytics.value = overviewResponse;
    currentPage.value = 1;
    selectedRows.value = selectedRows.value.filter((row) => matchResponse.items.some((item) => item.id === row.id));
  } catch (error) {
    handleApiError(error);
  } finally {
    loading.value = false;
    analyticsLoading.value = false;
  }
};

const resetFilters = () => {
  filters.keyword = "";
  filters.saveReason = "";
  dateRange.value = [];
  loadDashboard();
};

const handleSelectionChange = (rows: AdminGameRecordSummary[]) => {
  selectedRows.value = rows;
};

const handlePageChange = (page: number) => {
  currentPage.value = page;
};

const handlePageSizeChange = (size: number) => {
  pageSize.value = size;
  currentPage.value = 1;
};

const clearSelection = () => {
  tableRef.value?.clearSelection();
  selectedRows.value = [];
};

const logout = () => {
  adminStore.logout();
  router.push("/admin/login");
};

const openDetail = async (id: string) => {
  detailVisible.value = true;
  detailLoading.value = true;
  selectedRecord.value = null;
  replayDialogVisible.value = false;
  replayCode.value = "";
  try {
    selectedRecord.value = await adminApi.getMatch(id, adminStore.token);
  } catch (error) {
    handleApiError(error);
    detailVisible.value = false;
  } finally {
    detailLoading.value = false;
  }
};

const exportReadableLog = () => {
  if (!selectedReadableFull.value) {
    return;
  }
  Replay.triggerDownload(selectedReadableFull.value.content, selectedReadableFull.value.fileName);
};

const copyReadablePreview = async () => {
  if (!selectedReadablePreview.value) {
    return;
  }
  try {
    await navigator.clipboard.writeText(selectedReadablePreview.value.content);
    ElMessage.success("可读文件预览已复制");
  } catch {
    ElMessage.warning("复制失败，请手动选择文本");
  }
};

const showReplayCode = () => {
  if (!selectedReadableFull.value) {
    return;
  }
  replayCode.value = selectedReadableFull.value.replayCode;
  replayDialogVisible.value = true;
};

const copyReplayCode = async () => {
  if (!selectedReadableFull.value) {
    return;
  }
  try {
    await navigator.clipboard.writeText(selectedReadableFull.value.replayCode);
    ElMessage.success("Replay 代码已复制");
  } catch {
    replayCode.value = selectedReadableFull.value.replayCode;
    replayDialogVisible.value = true;
    ElMessage.warning("复制失败，已打开 Replay 代码窗口");
  }
};

const buildUniqueReadableName = (baseName: string, counter: Map<string, number>) => {
  const normalized = (baseName || "BingoLog.txt").trim() || "BingoLog.txt";
  const seen = counter.get(normalized) || 0;
  counter.set(normalized, seen + 1);
  if (seen === 0) {
    return normalized;
  }
  const extensionIndex = normalized.lastIndexOf(".");
  if (extensionIndex <= 0) {
    return `${normalized}_${seen + 1}`;
  }
  return `${normalized.slice(0, extensionIndex)}_${seen + 1}${normalized.slice(extensionIndex)}`;
};

const buildZipEntries = (items: AdminGameRecord[]): ZipFileEntry[] => {
  const counter = new Map<string, number>();
  return items.flatMap((item) => {
    if (!item.game_log) {
      return [];
    }
    const readable = Replay.buildReadableLogContent(item.game_log);
    const name = buildUniqueReadableName(readable.fileName, counter);
    return [
      {
        name,
        content: readable.content,
        lastModified: new Date(item.saved_at),
      },
    ];
  });
};

const exportReadableLogs = async (scope: "selected" | "current") => {
  const targetRows = scope === "selected" ? selectedRows.value : records.value;
  const replayableRows = targetRows.filter((item) => item.has_game_log);
  if (!replayableRows.length) {
    ElMessage.warning(scope === "selected" ? "已选记录中没有可导出的回放" : "当前结果中没有可导出的回放");
    return;
  }
  exporting.value = true;
  try {
    const batchResponse = await adminApi.getMatchesBatch(
      replayableRows.map((item) => item.id),
      adminStore.token
    );
    const zipEntries = buildZipEntries(batchResponse.items);
    if (!zipEntries.length) {
      ElMessage.warning("没有可导出的可读文件内容");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    Replay.triggerDownload(createZipArchive(zipEntries), `TFCC_ReplayReadableLogs_${stamp}.zip`, "application/zip");
    ElMessage.success(`已导出 ${zipEntries.length} 个可读文件`);
  } catch (error) {
    handleApiError(error);
  } finally {
    exporting.value = false;
  }
};

const jumpToAction = (timestamp: number) => {
  replayPlayerRef.value?.seekTo(timestamp);
};

onMounted(loadDashboard);
</script>

<style lang="scss" scoped>
.admin-page {
  min-height: 100%;
  padding: 14px;
  background:
    radial-gradient(circle at top left, rgba(54, 170, 217, 0.18), transparent 28%),
    linear-gradient(180deg, #071723, #102b3d 34%, #e7eff3 34%, #f6f9fb 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hero,
.panel,
.metric {
  border: 1px solid rgba(7, 34, 51, 0.12);
  box-shadow: 0 18px 42px rgba(7, 26, 39, 0.12);
}

.hero {
  display: grid;
  grid-template-columns: 1.45fr 0.85fr;
  gap: 14px;
  padding: 18px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(7, 25, 38, 0.96), rgba(11, 55, 78, 0.92));
  color: #fff;
}

.eyebrow {
  margin: 0 0 10px;
  color: rgba(198, 231, 249, 0.88);
  letter-spacing: 0.26em;
  font-size: 12px;
  text-transform: uppercase;
}

.hero h1 {
  margin: 0 0 8px;
  font-size: 28px;
}

.desc {
  margin: 0;
  color: rgba(231, 241, 247, 0.86);
  line-height: 1.55;
  font-size: 13px;
}

.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.hero-meta span {
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 12px;
}

.hero-actions,
.inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-content: flex-start;
  justify-content: flex-end;
}

.panel {
  padding: 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.panel-head h2,
.panel-head h3 {
  margin: 0;
  color: #10293a;
}

.panel-head p {
  margin: 4px 0 0;
  color: #5a7280;
  font-size: 12px;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 96px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(247, 251, 253, 0.94);
}

.metric.accent {
  background: linear-gradient(150deg, rgba(17, 111, 162, 0.98), rgba(37, 162, 201, 0.96));
  color: #fff;
}

.metric span,
.metric small {
  color: #637c8b;
  font-size: 12px;
}

.metric.accent span,
.metric.accent small {
  color: rgba(233, 246, 255, 0.86);
}

.metric strong {
  font-size: 24px;
  line-height: 1;
  color: #10293a;
}

.metric.accent strong {
  color: #fff;
}

.analytics {
  display: grid;
  grid-template-columns: 1.15fr 1fr 1fr;
  gap: 8px;
}

.bars {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(44px, 1fr));
  gap: 8px;
  align-items: end;
}

.bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: #5b7484;
  font-size: 12px;
}

.bar-box {
  width: 100%;
  height: 126px;
  display: flex;
  align-items: flex-end;
  padding: 8px 6px;
  border-radius: 12px;
  background: rgba(11, 57, 82, 0.06);
}

.bar {
  width: 100%;
  border-radius: 12px 12px 6px 6px;
  background: linear-gradient(180deg, #41b6df, #1d7fbe);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.list-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(11, 57, 82, 0.05);
}

.list-row strong {
  color: #10293a;
}

.list-row small {
  display: block;
  color: #5c7483;
  line-height: 1.4;
  font-size: 12px;
}

.user-side {
  text-align: right;
}

.distribution {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.distribution h3 {
  margin: 0 0 6px;
  color: #10293a;
}

.dist-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
  color: #5a7280;
  font-size: 12px;
}

.table-head {
  margin-bottom: 10px;
}

.table-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.detail {
  min-height: 280px;
}

.detail-actions {
  margin-bottom: 10px;
}

.summary {
  margin-bottom: 10px;
}

.detail-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(320px, 0.82fr) minmax(420px, 1.18fr);
  gap: 12px;
  align-items: start;
}

.detail-card {
  padding: 14px;
  border-radius: 12px;
  border: 1px solid rgba(7, 34, 51, 0.12);
  background: rgba(247, 251, 253, 0.96);
}

.replay-card {
  padding: 14px;
}

.action-list {
  max-height: 520px;
  overflow: auto;
}

.action-row {
  width: 100%;
  border: 0;
  text-align: left;
  cursor: pointer;
  transition: transform 120ms ease, background-color 120ms ease;
}

.action-row:hover {
  transform: translateY(-1px);
  background: rgba(29, 127, 190, 0.08);
}

.preview {
  margin: 0;
  min-height: 420px;
  max-height: 600px;
  overflow: auto;
  padding: 12px;
  border-radius: 10px;
  background: #081926;
  color: #d5ebf6;
  text-align: left;
  white-space: pre;
  word-break: normal;
  line-height: 1.65;
  font-size: 12px;
  font-family: Consolas, "Courier New", monospace;
}

:deep(.el-table) {
  --el-table-header-bg-color: rgba(11, 57, 82, 0.05);
  --el-table-row-hover-bg-color: rgba(29, 127, 190, 0.06);
}

:deep(.el-table th.el-table__cell),
:deep(.el-table td.el-table__cell) {
  padding: 8px 0;
}

:deep(.el-input__wrapper),
:deep(.el-select__wrapper),
:deep(.el-date-editor.el-input__wrapper) {
  box-shadow: none;
  border: 1px solid rgba(7, 34, 51, 0.12);
}

:deep(.el-form--inline .el-form-item) {
  margin-right: 10px;
  margin-bottom: 8px;
}

:deep(.el-button + .el-button) {
  margin-left: 0;
}

@media (max-width: 1380px) {
  .metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .analytics,
  .detail-grid,
  .distribution,
  .hero {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .admin-page {
    padding: 10px;
  }

  .metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .hero h1 {
    font-size: 24px;
  }
}

@media (max-width: 640px) {
  .metrics {
    grid-template-columns: 1fr;
  }

  .panel,
  .hero,
  .metric {
    border-radius: 18px;
  }
}
</style>
