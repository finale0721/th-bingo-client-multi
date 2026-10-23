<template>
  <el-dialog
    v-model="editorStore.isPresetManagerVisible"
    :title="dialogTitle"
    width="900px"
    top="5vh"
    class="preset-dialog"
  >
    <div class="preset-toolbar">
      <div class="left-group">
        <el-button-group v-if="editorStore.isEditorMode && !isAutoSavePage">
          <el-button type="primary" @click="handleExportPage">导出本页</el-button>
          <el-button type="primary" @click="handleExportAll">导出全部</el-button>
        </el-button-group>
        <el-tag v-if="isAutoSavePage" type="info" size="large" effect="plain" class="auto-save-tag">
          <el-icon><Info-Filled /></el-icon>
          自动存档页 - 只读模式
        </el-tag>
      </div>
      <div class="right-group">
        <template v-if="editorStore.isEditorMode && !isAutoSavePage">
          <el-button type="success" @click="openImportDialog">导入预设</el-button>
          <el-button type="warning" @click="replayDialogVisible = true">从Replay导入</el-button>
        </template>
      </div>
    </div>

    <div class="preset-list">
      <el-table :data="currentPageSlots" border stripe height="480px" size="small" :header-cell-style="{background:'#f5f7fa'}">
        <el-table-column label="ID" width="60" align="center">
          <template #default="{ row }">
            <span class="id-cell" :class="{ 'auto-save-id': isAutoSaveId(row.id) }">{{ row.id + 1 }}</span>
          </template>
        </el-table-column>

        <el-table-column label="备注" min-width="160">
          <template #default="{ row }">
            <div v-if="hasPreset(row.id)" class="note-cell">
              <span class="note-text">{{ getPreset(row.id).note }}</span>
            </div>
            <span v-else class="empty-text">-- 空 --</span>
          </template>
        </el-table-column>

        <el-table-column label="符卡数" width="100" align="center">
          <template #default="{ row }">
            <span v-if="hasPreset(row.id)" class="count-text">{{ getCardCountInfo(getPreset(row.id)) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="保存时间" width="150" align="center">
          <template #default="{ row }">
            <span v-if="hasPreset(row.id)" class="time-text">{{ formatTime(getPreset(row.id).timestamp) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="260" align="center">
          <template #default="{ row }">
            <div class="action-buttons" v-if="hasPreset(row.id)">
              <template v-if="!editorStore.isEditorMode">
                <el-button type="success" size="small" @click="handleStartGame(row.id)">开始游戏</el-button>
              </template>

              <template v-else-if="!isAutoSaveId(row.id)">
                <div class="action-group safe-actions">
                  <el-button type="success" link size="small" @click="handleLoad(row.id)">读取</el-button>
                  <el-button type="primary" link size="small" @click="handleEditNote(row.id)">备注</el-button>
                  <el-button type="primary" link size="small" @click="handleExportSingle(row.id)">导出</el-button>
                </div>
                <el-divider direction="vertical" class="action-divider" />
                <div class="action-group danger-actions">
                  <el-button type="danger" link size="small" @click="handleSave(row.id)">覆盖</el-button>
                  <el-button type="danger" link size="small" @click="handleDelete(row.id)">删除</el-button>
                </div>
              </template>
              <template v-else>
                <el-button type="success" link size="small" @click="handleLoad(row.id)">读取</el-button>
                <el-tag type="info" size="small">自动存档</el-tag>
              </template>
            </div>
            <div v-else-if="editorStore.isEditorMode && !isAutoSaveId(row.id)" class="action-buttons">
              <el-button type="primary" link size="small" @click="handleSave(row.id)">保存</el-button>
              <el-button type="success" link size="small" @click="handleImportSingle(row.id)">导入</el-button>
            </div>
            <div v-else-if="isAutoSaveId(row.id)">
              <el-tag type="info" size="small">系统保留</el-tag>
            </div>
          </template>
        </el-table-column>

      </el-table>
    </div>

    <div class="preset-pagination">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="10"
        :total="110"
        layout="prev, pager, next"
        background
      />
      <el-button 
        v-if="editorStore.isEditorMode && !isAutoSavePage" 
        type="danger" 
        size="small" 
        class="clear-page-btn"
        @click="handleClearPage"
      >
        清空本页
      </el-button>
    </div>

    <!-- 导入预设弹窗 -->
    <el-dialog 
      v-model="importDialogVisible" 
      title="导入预设" 
      width="500px" 
      append-to-body
      class="import-dialog"
    >
      <div class="dialog-content">
        <el-alert
          title="导入说明"
          type="info"
          :closable="false"
          show-icon
          class="import-alert"
        >
          <p>从当前页（第 {{ currentPage }} 页）开始，按顺序填充空栏位</p>
        </el-alert>
        <el-input v-model="importCode" type="textarea" :rows="6" placeholder="在此处粘贴预设代码..." />
      </div>
      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleImport">开始导入</el-button>
      </template>
    </el-dialog>

    <!-- 导入单个栏位弹窗 -->
    <el-dialog 
      v-model="singleImportDialogVisible" 
      :title="`导入到栏位 #${singleImportTargetId + 1}`" 
      width="500px" 
      append-to-body
      class="single-import-dialog"
    >
      <div class="dialog-content">
        <el-alert
          v-if="singleImportWarning"
          :title="singleImportWarning"
          type="warning"
          :closable="false"
          show-icon
          class="import-warning"
        />
        <p class="dialog-hint">从剪贴板导入预设代码到当前栏位</p>
        <el-input v-model="singleImportCode" type="textarea" :rows="6" placeholder="在此处粘贴预设代码..." />
      </div>
      <template #footer>
        <el-button @click="singleImportDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmSingleImport">导入</el-button>
      </template>
    </el-dialog>

    <!-- Replay导入弹窗 -->
    <el-dialog 
      v-model="replayDialogVisible" 
      title="从Replay导入" 
      width="500px" 
      append-to-body
      class="replay-dialog"
    >
      <div class="dialog-content">
        <el-alert
          title="警告：此操作将覆盖当前编辑器中的所有内容"
          type="warning"
          :closable="false"
          show-icon
        />
        <el-input v-model="replayCode" type="textarea" :rows="6" placeholder="在此处粘贴Replay代码..." />
      </div>
      <template #footer>
        <el-button @click="replayDialogVisible = false">取消</el-button>
        <el-button type="danger" @click="handleReplayImport">覆盖导入</el-button>
      </template>
    </el-dialog>

    <!-- 导出结果弹窗 -->
    <el-dialog 
      v-model="exportResultVisible" 
      :title="exportResultTitle" 
      width="500px" 
      append-to-body
      class="export-dialog"
    >
      <div class="dialog-content">
        <el-alert
          v-if="exportedCount > 0"
          :title="`成功导出 ${exportedCount} 个预设`"
          type="success"
          :closable="false"
          show-icon
          class="export-success-alert"
        />
        <el-input v-model="exportResult" type="textarea" :rows="6" readonly />
      </div>
      <template #footer>
        <el-button @click="exportResultVisible = false">关闭</el-button>
        <el-button type="primary" @click="copyExport">复制到剪贴板</el-button>
      </template>
    </el-dialog>

    <!-- 导入结果弹窗 -->
    <el-dialog 
      v-model="importResultVisible" 
      title="导入结果" 
      width="400px" 
      append-to-body
      class="import-result-dialog"
    >
      <div class="import-result-content">
        <el-result
          :icon="importResultSuccess ? 'success' : 'warning'"
          :title="importResultSuccess ? '导入完成' : '部分导入'"
          :sub-title="importResultMessage"
        />
      </div>
      <template #footer>
        <el-button type="primary" @click="importResultVisible = false">确定</el-button>
      </template>
    </el-dialog>

    <!-- 清空本页确认弹窗 -->
    <el-dialog
      v-model="clearPageDialogVisible"
      title="确认清空本页"
      width="400px"
      append-to-body
      class="clear-dialog"
    >
      <div class="clear-dialog-content">
        <el-icon class="warning-icon"><Warning-Filled /></el-icon>
        <p>确定要清空第 <strong>{{ currentPage }}</strong> 页的所有预设吗？</p>
        <p class="warning-text">此操作不可恢复！</p>
      </div>
      <template #footer>
        <el-button @click="clearPageDialogVisible = false">取消</el-button>
        <el-button type="danger" @click="confirmClearPage">确认清空</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from "vue";
import { useEditorStore } from '@/store/EditorStore';
import { useGameStore } from '@/store/GameStore';
import { useRoomStore } from '@/store/RoomStore';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ElDialog, ElButton, ElButtonGroup, ElTable, ElTableColumn, ElPagination, ElInput, ElTag, ElAlert, ElResult, ElIcon } from 'element-plus';
import { InfoFilled, WarningFilled } from '@element-plus/icons-vue';
import { EditorPreset, Spell } from "@/types";

const gameStore = useGameStore();
const roomStore = useRoomStore();
const editorStore = useEditorStore();
const currentPage = ref(1);
const importDialogVisible = ref(false);
const replayDialogVisible = ref(false);
const exportResultVisible = ref(false);
const importCode = ref('');
const replayCode = ref('');
const exportResult = ref('');
const exportResultTitle = ref('导出结果');
const exportedCount = ref(0);

// 单个导入相关
const singleImportDialogVisible = ref(false);
const singleImportTargetId = ref(0);
const singleImportCode = ref('');
const singleImportWarning = ref('');

// 导入结果相关
const importResultVisible = ref(false);
const importResultSuccess = ref(true);
const importResultMessage = ref('');

// 清空本页相关
const clearPageDialogVisible = ref(false);

// 自动存档页范围：101-110 对应 id 100-109
const AUTO_SAVE_START = 100;
const AUTO_SAVE_END = 109;

const isAutoSavePage = computed(() => currentPage.value === 11);
const isAutoSaveId = (id: number) => id >= AUTO_SAVE_START && id <= AUTO_SAVE_END;

const dialogTitle = computed(() => {
  if (isAutoSavePage.value) {
    return '自动存档页';
  }
  return editorStore.isEditorMode ? '预设管理器' : '选择预设开始游戏';
});

const currentPageSlots = computed(() => {
  const start = (currentPage.value - 1) * 10;
  return Array.from({ length: 10 }, (_, i) => ({ id: start + i }));
});

const hasPreset = (id: number) => editorStore.presets.some(p => p.id === id);
const getPreset = (id: number) => editorStore.presets.find(p => p.id === id)!;

const handleSave = async (id: number) => {
  let note = "新预设";
  if (hasPreset(id)) {
    note = getPreset(id).note;
  }
  try {
    const { value } = await ElMessageBox.prompt('请输入备注', '保存预设', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: note,
    });
    editorStore.savePreset(id, value);
    ElMessage.success('保存成功');
  } catch {}
};

const handleLoad = (id: number) => {
  ElMessageBox.confirm('确定要读取此预设吗？当前未保存的修改将丢失。', '提示', { type: 'warning' })
    .then(() => {
      editorStore.loadPreset(id);
      ElMessage.success('读取成功');
      editorStore.isPresetManagerVisible = false;
    }).catch(() => {});
};

const handleDelete = (id: number) => {
  ElMessageBox.confirm('确定删除此预设？', '警告', { type: 'warning' }).then(() => {
    editorStore.deletePreset(id);
    ElMessage.success('已删除');
  }).catch(() => {});
};

const handleEditNote = async (id: number) => {
  const preset = getPreset(id);
  try {
    const { value } = await ElMessageBox.prompt('修改备注', '编辑', { inputValue: preset.note });
    editorStore.savePreset(id, value);
  } catch {}
};

const handleExportPage = () => {
  const ids = currentPageSlots.value.map(s => s.id).filter(id => hasPreset(id));
  if (ids.length === 0) {
    ElMessage.info('当前页没有可导出的预设');
    return;
  }
  const code = editorStore.exportPresets(ids);
  showExport(code, '导出本页结果', ids.length);
};

const handleExportAll = () => {
  // 过滤掉自动存档的预设，只导出用户保存的预设（id 0-99）
  const userPresets = editorStore.presets.filter(p => p.id < AUTO_SAVE_START);
  if (userPresets.length === 0) {
    ElMessage.info('没有可导出的预设');
    return;
  }
  const ids = userPresets.map(p => p.id);
  const code = editorStore.exportPresets(ids);
  showExport(code, '导出全部结果', ids.length);
};

// 兼容非HTTPS环境的复制函数
const copyToClipboard = async (text: string): Promise<boolean> => {
  // 优先使用现代 Clipboard API
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.log('Clipboard API 失败，尝试降级方案');
    }
  }
  
  // 降级方案：使用 document.execCommand
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    return successful;
  } catch (err) {
    console.error('降级复制方案也失败:', err);
    return false;
  }
};

const handleExportSingle = async (id: number) => {
  const code = editorStore.exportPresets([id]);
  if (code && code !== 'W10=') {
    const success = await copyToClipboard(code);
    if (success) {
      ElMessage.success('已复制单个预设代码到剪贴板');
    } else {
      // 复制失败时弹出导出弹窗让用户手动复制
      showExport(code, `导出栏位 #${id + 1}`, 1);
      ElMessage.warning('自动复制失败，请手动复制代码');
    }
  } else {
    ElMessage.error('导出失败');
  }
};

const showExport = (code: string, title: string = '导出结果', count: number = 0) => {
  if (!code || code === 'W10=') {
    ElMessage.info('没有可导出的数据');
    return;
  }
  exportResult.value = code;
  exportResultTitle.value = title;
  exportedCount.value = count;
  exportResultVisible.value = true;
};

const copyExport = async () => {
  const success = await copyToClipboard(exportResult.value);
  if (success) {
    ElMessage.success('已复制到剪贴板');
    exportResultVisible.value = false;
  } else {
    ElMessage.error('复制失败，请手动复制');
  }
};

const openImportDialog = () => {
  importCode.value = '';
  importDialogVisible.value = true;
};

const handleImport = () => {
  if (!importCode.value) {
    ElMessage.warning('请输入预设代码');
    return;
  }
  
  // 从当前页开始，顺序寻找空栏位
  const result = editorStore.importPresetsToEmptySlots(importCode.value, currentPage.value);
  
  importDialogVisible.value = false;
  importCode.value = '';
  
  importResultSuccess.value = result.success;
  importResultMessage.value = result.message;
  importResultVisible.value = true;
};

// 从剪贴板读取文本的降级方案
const readFromClipboard = async (): Promise<string | null> => {
  // 优先使用现代 Clipboard API
  if (navigator.clipboard && window.isSecureContext) {
    try {
      const text = await navigator.clipboard.readText();
      return text;
    } catch (err) {
      console.log('Clipboard read API 失败');
    }
  }
  return null;
};

// 单个栏位导入 - 直接读取剪贴板
const handleImportSingle = async (id: number) => {
  const clipboardText = await readFromClipboard();
  
  if (!clipboardText) {
    // 无法读取剪贴板时，弹出弹窗让用户手动输入
    singleImportTargetId.value = id;
    singleImportCode.value = '';
    singleImportWarning.value = '';
    singleImportDialogVisible.value = true;
    //ElMessage.info('无法读取剪贴板，请手动粘贴代码');
    return;
  }
  
  // 尝试导入剪贴板内容
  const result = editorStore.importSinglePreset(clipboardText, id);
  
  if (result.success) {
    if (result.warning) {
      ElMessage.warning(result.message);
    } else {
      ElMessage.success(result.message);
    }
  } else {
    // 导入失败时，弹出弹窗让用户修改
    singleImportTargetId.value = id;
    singleImportCode.value = clipboardText;
    singleImportWarning.value = result.message;
    singleImportDialogVisible.value = true;
  }
};

const confirmSingleImport = () => {
  if (!singleImportCode.value) {
    ElMessage.warning('请输入预设代码');
    return;
  }
  
  const result = editorStore.importSinglePreset(singleImportCode.value, singleImportTargetId.value);
  
  singleImportDialogVisible.value = false;
  singleImportCode.value = '';
  
  if (result.success) {
    if (result.warning) {
      ElMessage.warning(result.message);
    } else {
      ElMessage.success(result.message);
    }
  } else {
    ElMessage.error(result.message);
  }
};

const handleReplayImport = () => {
  if (!replayCode.value) return;
  const success = editorStore.importReplay(replayCode.value);
  if (success) {
    ElMessage.success('Replay数据已加载到编辑器');
    replayDialogVisible.value = false;
    editorStore.isPresetManagerVisible = false;
    replayCode.value = '';
  } else {
    ElMessage.error('Replay解析失败');
  }
};

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

const getCardCountInfo = (preset: EditorPreset) => {
  const normalized = editorStore.getNormalizedPreset(preset);
  const countA = normalized.data.spells.filter(s => s.name && s.name.trim() !== '').length;
  const flags: string[] = [];
  if (normalized.data.roomConfig.dual_board > 0) {
    const countB = normalized.data.spells2.filter(s => s.name && s.name.trim() !== '').length;
    flags.push("双盘");
    return `${countA} / ${countB}${flags.length ? ` (${flags.join(" / ")})` : ""}`;
  }
  return `${countA}${flags.length ? ` (${flags.join(" / ")})` : ""}`;
};

const handleStartGame = (id: number) => {
  const preset = editorStore.getNormalizedPreset(getPreset(id));
  if (preset.data.spells2.some((spell) => spell.name || spell.game || spell.rank)) {
    preset.data.roomConfig.dual_board = Math.max(1, preset.data.roomConfig.dual_board || 0) as any;
  }
  const area = (preset.data.roomConfig.board_size || 5) ** 2;

  const validateBoard = (spells: Spell[]) => {
    return spells.filter(s => s.name && s.name.trim() !== '').length === area;
  };

  if (!validateBoard(preset.data.spells)) {
    ElMessage.error(`盘面A符卡数量不足${area}张，无法开始游戏`);
    return;
  }

  if (preset.data.roomConfig.dual_board > 0) {
    if (!validateBoard(preset.data.spells2)) {
      ElMessage.error(`盘面B符卡数量不足${area}张，无法开始游戏`);
      return;
    }
  }

  // 发送请求
  gameStore.startCustomGame(preset)
    .then(() => {
      ElMessage.success('自定义游戏请求已发送');
      editorStore.isPresetManagerVisible = false;
    })
    .catch((err) => {
      ElMessage.error('开始游戏失败');
      console.error(err);
    });
};

// 清空本页
const handleClearPage = () => {
  const ids = currentPageSlots.value.map(s => s.id).filter(id => hasPreset(id));
  if (ids.length === 0) {
    ElMessage.info('当前页已经是空的');
    return;
  }
  clearPageDialogVisible.value = true;
};

const confirmClearPage = () => {
  const ids = currentPageSlots.value.map(s => s.id).filter(id => hasPreset(id));
  ids.forEach(id => {
    editorStore.deletePreset(id);
  });
  ElMessage.success(`已清空第 ${currentPage.value} 页的 ${ids.length} 个预设`);
  clearPageDialogVisible.value = false;
};
</script>

<style scoped>
.preset-toolbar {
  margin-bottom: 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.left-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.auto-save-tag {
  font-size: 14px;
}

.preset-pagination {
  margin-top: 15px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 15px;
}

.clear-page-btn {
  margin-left: 20px;
}

.id-cell {
  font-weight: bold;
}

.auto-save-id {
  color: #909399;
}

.action-buttons {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.action-group {
  display: flex;
  gap: 5px;
  align-items: center;
}

.safe-actions {
  /* 常规操作组 */
}

.danger-actions {
  /* 危险操作组 */
  padding-left: 5px;
}

.action-divider {
  height: 20px;
  margin: 0 5px;
}

.empty-text {
  color: #909399;
  font-style: italic;
}

.note-text {
  color: #303133;
}

.count-text {
  color: #409EFF;
  font-weight: 500;
}

.time-text {
  color: #606266;
  font-size: 12px;
}

/* 弹窗样式优化 */
.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.import-alert {
  margin-bottom: 10px;
}

.import-alert p {
  margin: 5px 0 0 0;
  font-size: 13px;
}

.import-warning {
  margin-bottom: 10px;
}

.dialog-hint {
  color: #606266;
  font-size: 14px;
  margin: 0;
}

.export-success-alert {
  margin-bottom: 10px;
}

.import-result-content {
  padding: 20px 0;
}

.clear-dialog-content {
  text-align: center;
  padding: 20px 0;
}

.warning-icon {
  font-size: 48px;
  color: #E6A23C;
  margin-bottom: 15px;
}

.warning-text {
  color: #F56C6C;
  font-weight: bold;
  margin-top: 10px;
}

:deep(.preset-dialog .el-dialog__body) {
  padding: 20px;
}

:deep(.import-dialog .el-dialog__body),
:deep(.single-import-dialog .el-dialog__body),
:deep(.replay-dialog .el-dialog__body),
:deep(.export-dialog .el-dialog__body) {
  padding: 20px;
}

:deep(.clear-dialog .el-dialog__body) {
  padding: 10px 20px;
}
</style>
