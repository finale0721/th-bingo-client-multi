<template>
  <el-dialog :model-value="visible" title="自定义难度设置" @update:model-value="$emit('update:visible', $event)" width="600px">
    <div class="balancer-content">
      <!-- 数量设置 -->
      <div class="section">
        <div class="title">数量设置</div>
        <el-form label-width="90px" label-position="left">
          <el-form-item v-for="i in 5" :key="i" :label="`${i}级`">
            <el-input-number v-model="localCounts[i-1]" :min="getMinCount(i-1)" :max="maxArea" size="small" controls-position="right" />
          </el-form-item>
          <el-form-item label="总数">
            <span :style="{ color: totalCount === maxArea ? 'inherit' : 'red', fontWeight: 'bold' }">{{ totalCount }} / {{ maxArea }}</span>
          </el-form-item>
        </el-form>
      </div>

      <!-- 生成选项 -->
      <div class="section">
        <div class="title">生成选项</div>
        <el-form label-width="120px" label-position="left">
          <el-form-item label="4/5级保底分布">
            <el-checkbox v-model="guaranteeEnabled" />
          </el-form-item>
          <el-form-item label="4/5级生成降级">
            <el-checkbox v-model="downgradeEnabled" />
          </el-form-item>
          <el-form-item label="EX默认生成方法">
            <el-checkbox v-model="exGuaranteed" />
          </el-form-item>
          <el-form-item label="4级保底数量">
            <el-input-number v-model="guaranteed4Star" :min="0" :max="boardSize" size="small" :disabled="!guaranteeEnabled" @change="adjustGuaranteed(4)" />
          </el-form-item>
          <el-form-item label="5级保底数量">
            <el-input-number v-model="guaranteed5Star" :min="0" :max="boardSize" size="small" :disabled="!guaranteeEnabled" @change="adjustGuaranteed(5)" />
          </el-form-item>
          <el-form-item label="EX自定义数量">
            <el-input-number v-model="exCount" :min="0" :max="maxArea" size="small" :disabled="exGuaranteed"/>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <template #footer>
      <div class="footer-buttons">
        <el-button @click="resetToDefault">重置</el-button>
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="primary" @click="handleConfirm">确认</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import { ElDialog, ElForm, ElFormItem, ElInputNumber, ElCheckbox, ElButton } from 'element-plus';

const props = defineProps<{
  visible: boolean;
  currentCounts: number[];
  boardArea?: number;
  defaultCounts?: number[];
}>();

const emit = defineEmits(['update:visible', 'confirm']);

const effectiveDefaults = computed(() => props.defaultCounts || [2, 6, 12, 4, 1, 1, 0, 4, 1, 1, 5]);

const localCounts = ref<number[]>([...props.currentCounts.slice(0, 5)]);
const guaranteeEnabled = ref(props.currentCounts[5] === 1);
const downgradeEnabled = ref(props.currentCounts[6] === 1);
const guaranteed4Star = ref(props.currentCounts[7]);
const guaranteed5Star = ref(props.currentCounts[8]);
const exGuaranteed = ref(props.currentCounts[9] === 1);
const exCount = ref(props.currentCounts[10] ?? effectiveDefaults.value[10]);

const maxArea = computed(() => props.boardArea || 25);
const boardSize = computed(() => Math.round(Math.sqrt(maxArea.value)));
const totalCount = computed(() => localCounts.value.reduce((sum, val) => sum + val, 0));

const getMinCount = (index: number) => {
  if (guaranteeEnabled.value) {
    if (index === 3) return guaranteed4Star.value;
    if (index === 4) return guaranteed5Star.value;
  }
  return 0;
};

const adjustGuaranteed = (changed: 4 | 5) => {
  const sz = boardSize.value;
  if (guaranteed4Star.value + guaranteed5Star.value != sz) {
    if (changed === 4) {
      guaranteed5Star.value = sz - guaranteed4Star.value;
    } else {
      guaranteed4Star.value = sz - guaranteed5Star.value;
    }
  }
};

const resetToDefault = () => {
  const defaults = effectiveDefaults.value;
  localCounts.value = defaults.slice(0, 5);
  guaranteeEnabled.value = defaults[5] === 1;
  downgradeEnabled.value = defaults[6] === 1;
  guaranteed4Star.value = defaults[7];
  guaranteed5Star.value = defaults[8];
  exGuaranteed.value = defaults[9] === 1;
  exCount.value = defaults[10];
};

const handleConfirm = () => {
  const newCounts = [
    ...localCounts.value,
    guaranteeEnabled.value ? 1 : 0,
    downgradeEnabled.value ? 1 : 0,
    guaranteed4Star.value,
    guaranteed5Star.value,
    exGuaranteed.value ? 1 : 0,
    exCount.value,
  ];
  emit('confirm', newCounts);
  emit('update:visible', false);
};

const handleCancel = () => {
  localCounts.value = [...props.currentCounts.slice(0, 5)];
  guaranteeEnabled.value = props.currentCounts[5] === 1;
  downgradeEnabled.value = props.currentCounts[6] === 1;
  guaranteed4Star.value = props.currentCounts[7];
  guaranteed5Star.value = props.currentCounts[8];
  exGuaranteed.value = props.currentCounts[9] === 1;
  exCount.value = props.currentCounts[10];
  emit('update:visible', false);
};

watch(() => props.currentCounts, (newVal) => {
  if (newVal && newVal.length === effectiveDefaults.value.length) {
    localCounts.value = [...newVal.slice(0, 5)];
    guaranteeEnabled.value = newVal[5] === 1;
    downgradeEnabled.value = newVal[6] === 1;
    guaranteed4Star.value = newVal[7];
    guaranteed5Star.value = newVal[8];
    exGuaranteed.value = newVal[9] === 1;
    exCount.value = newVal[10] ?? effectiveDefaults.value[10];
  } else {
    resetToDefault();
  }
}, { immediate: true });

watch([guaranteeEnabled, guaranteed4Star, guaranteed5Star], () => {
  const min4 = getMinCount(3);
  if (localCounts.value[3] < min4) {
    localCounts.value[3] = min4;
  }
  const min5 = getMinCount(4);
  if (localCounts.value[4] < min5) {
    localCounts.value[4] = min5;
  }
}, { deep: true });

</script>

<style scoped>
.balancer-content {
  display: flex;
  justify-content: space-around;
  gap: 20px;
}
.section {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 20px;
  width: 48%;
}
.title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 15px;
  text-align: center;
}
.footer-buttons {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 20px;
}
:deep(.el-form-item) {
  margin-bottom: 12px;
}
</style>
