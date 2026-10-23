<template>
  <el-dialog
    v-model="visible"
    title="编辑盘面符卡"
    width="500px"
    @close="onCancel"
    class="spell-editor-dialog"
    append-to-body
  >
    <el-form :model="formData" label-width="70px" class="editor-form">
      <!-- 核心数据区 -->
      <div class="section-title">基础信息</div>
      <el-form-item label="名称" required>
        <el-input v-model="formData.name" placeholder="符卡名称" :prefix-icon="Edit" />
      </el-form-item>

      <el-row :gutter="15">
        <el-col :span="12">
          <el-form-item label="作品">
            <el-input v-model="formData.game" placeholder="" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="分类">
            <el-input v-model="formData.rank" placeholder="L/EX/PH" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="15">
        <el-col :span="12">
          <el-form-item label="评级">
            <el-rate v-model="formData.star" :min=1 :max="5" clearable />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="位置">
            <el-input v-model="formData.desc" placeholder="THXX-X" />
          </el-form-item>
        </el-col>
      </el-row>



      <el-divider border-style="dashed" />

      <!-- 状态设定区 -->
      <div class="section-title">盘面设定</div>
      <el-row :gutter="15">
        <el-col :span="14">
          <el-form-item label="初始状态">
            <el-select v-model="formData.status" placeholder="选择状态" style="width: 100%">
              <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value">
                <span style="float: left">{{ item.label }}</span>
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="10">
          <el-form-item label="翻转卡" v-if="roomStore.roomConfig.dual_board > 0">
            <el-switch
              v-model="formData.isPortal"
              inline-prompt
              active-text="是"
              inactive-text="否"
            />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="onSaveToDb" type="success" plain :icon="FolderAdd">存入本地库</el-button>
        <div class="right-actions">
          <el-button @click="onClear" type="warning" plain :icon="Delete">清空</el-button>
          <el-button type="primary" @click="onConfirm" :icon="Check">确认</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { ref, watch } from "vue";
import { Spell, SpellStatus } from "@/types";
import { useRoomStore } from "@/store/RoomStore";
import { Edit, FolderAdd, Delete, Check } from '@element-plus/icons-vue';

// --- 显式引入 Element Plus 组件 ---
import {
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElRow,
  ElCol,
  ElRate,
  ElDivider,
  ElSelect,
  ElOption,
  ElSwitch,
  ElButton,
  ElMessage
} from "element-plus";

const roomStore = useRoomStore();

const props = defineProps<{
  spell: Spell;
  status: SpellStatus;
  isPortal: boolean;
}>();

const emits = defineEmits(["confirm", "clear", "close"]);

const visible = ref(true);
const formData = ref({
  name: "",
  game: "",
  rank: "",
  star: 1,
  desc: "",
  status: SpellStatus.NONE,
  isPortal: false,
});

const statusMenu = [
  { label: "置空", value: SpellStatus.NONE },
  { label: "左侧玩家选择", value: SpellStatus.A_SELECTED },
  { label: "右侧玩家选择", value: SpellStatus.B_SELECTED },
  { label: "两侧玩家选择", value: SpellStatus.BOTH_SELECTED },
  { label: "左侧玩家收取", value: SpellStatus.A_ATTAINED },
  { label: "右侧玩家收取", value: SpellStatus.B_ATTAINED },
  { label: "禁用", value: SpellStatus.BANNED },
  { label: "双方隐藏", value: SpellStatus.BOTH_HIDDEN },
  { label: "仅显示游戏", value: SpellStatus.ONLY_REVEAL_GAME },
  { label: "仅显示来源", value: SpellStatus.ONLY_REVEAL_GAME_STAGE },
  //{ label: "仅显示星级", value: SpellStatus.ONLY_REVEAL_STAR },
];

const statusOptions = statusMenu;

watch(
  () => props.spell,
  (newSpell) => {
    if (newSpell) {
      formData.value.name = newSpell.name;
      formData.value.game = newSpell.game;
      formData.value.rank = newSpell.rank;
      formData.value.star = newSpell.star || 0;
      formData.value.desc = newSpell.desc;
      formData.value.status = props.status;
      formData.value.isPortal = props.isPortal;
    }
  },
  { immediate: true }
);

const onConfirm = () => {
  emits("confirm", {
    spellData: {
      name: formData.value.name,
      game: formData.value.game,
      rank: formData.value.rank,
      star: formData.value.star,
      desc: formData.value.desc,
    },
    status: formData.value.status,
    isPortal: formData.value.isPortal,
  });
};

const onClear = () => {
  emits("clear");
};

const onCancel = () => {
  emits("close");
};

const onSaveToDb = () => {
  const tempSpell: Spell = {
    index: 0,
    name: formData.value.name,
    game: formData.value.game,
    rank: formData.value.rank,
    star: formData.value.star,
    desc: formData.value.desc,
    id: 0, fastest: 0, miss_time: 0, power_weight: 0, difficulty: 0, change_rate: 0, max_cap_rate: 0
  };

  if (!tempSpell.name) {
    ElMessage.warning("名称不能为空");
    return;
  }

  const success = editorStore.saveToLocalDatabase(tempSpell);
  if (success) {
    ElMessage.success("已保存到本地数据库");
  } else {
    ElMessage.warning("该符卡已存在于本地数据库");
  }
};
</script>

<style lang="scss" scoped>
.section-title {
  font-size: 14px;
  font-weight: bold;
  color: #606266;
  margin-bottom: 10px;
  padding-left: 5px;
  border-left: 3px solid var(--el-color-primary);
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.right-actions {
  display: flex;
  gap: 10px;
}

:deep(.el-rate) {
  height: 32px;
  display: flex;
  align-items: center;
}
</style>