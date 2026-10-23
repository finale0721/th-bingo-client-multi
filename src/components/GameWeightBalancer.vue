<template>
  <el-dialog
      v-model="dialogVisible"
      width="700px"
      :before-close="handleCancel"
  >
    <div class="weight-balancer">
      <div class="sliders-container">
        <div
            v-for="(game, index) in gameList"
            :key="game.code"
            class="slider-item"
            :class="{ 'first-slider': index === 0 }"
        >
          <div class="slider-track">
            <div
                v-for="level in [2, 1, 0, -1, -2]"
                :key="level"
                class="slider-level"
                :class="{ active: currentValues[game.code] === level }"
                @click="setSliderValue(game.code, level)"
            >
              <div class="level-marker"></div>
            </div>
          </div>
          <div class="slider-value" :class="getValueClass(currentValues[game.code])">
            {{ currentValues[game.code] }}
          </div>
          <div class="slider-label">{{ game.name }}</div>
        </div>
      </div>

      <div class="action-buttons">
        <el-button @click="resetAll">重置</el-button>
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="primary" @click="handleConfirm">确认</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import {ref, watch} from 'vue'
import {ElButton, ElDialog} from 'element-plus'

interface GameItem {
  code: string
  name: string
}

interface Props {
  visible: boolean
  gameList: GameItem[]
  currentWeights: Record<string, number>
}

interface Emits {
  (e: 'update:visible', value: boolean): void
  (e: 'confirm', weights: Record<string, number>): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// 对话框显示状态
const dialogVisible = ref(false)

// 当前滑块值（存储的是档位值：-2, -1, 0, 1, 2）
const currentValues = ref<Record<string, number>>({})

// 监听visible变化
watch(() => props.visible, (newVal) => {
  dialogVisible.value = newVal
  if (newVal) {
    initializeValues()
  }
})

// 监听dialogVisible变化，同步到父组件
watch(dialogVisible, (newVal) => {
  emit('update:visible', newVal)
})

// 获取数值对应的CSS类名
const getValueClass = (value: number) => {
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return 'zero'
}

// 初始化滑块值
const initializeValues = () => {
  const values: Record<string, number> = {}

  // 处理第一个特殊滑块（weight_balancer）
  if (props.gameList.length > 0) {
    const firstGame = props.gameList[0]
    values[firstGame.code] = props.currentWeights['weight_balancer'] || 0
  }

  // 处理其他游戏滑块 - 保留所有游戏的权重，而不仅仅是当前列表中的游戏
  props.gameList.slice(1).forEach(game => {
    // 优先使用当前游戏的权重，如果没有则使用默认值0
    values[game.code] = props.currentWeights[game.code] || 0
  })

  currentValues.value = values
}

// 设置滑块值
const setSliderValue = (gameCode: string, level: number) => {
  currentValues.value[gameCode] = level
}

// 重置所有滑块
const resetAll = () => {
  Object.keys(currentValues.value).forEach(key => {
    currentValues.value[key] = 0 // 重置为中间档位（0）
  })
}

// 处理取消
const handleCancel = () => {
  dialogVisible.value = false
}

// 处理确认
const handleConfirm = () => {
  // 创建新的权重对象，保留原有的所有权重设置
  const weights: Record<string, number> = { ...props.currentWeights }

  // 处理第一个特殊滑块
  if (props.gameList.length > 0) {
    const firstGame = props.gameList[0]
    const level = currentValues.value[firstGame.code]
    weights['weight_balancer'] = level || 0
  }

  // 处理其他游戏滑块 - 更新当前列表中的游戏权重
  props.gameList.slice(1).forEach(game => {
    const level = currentValues.value[game.code]
    weights[game.code] = level || 0
  })

  emit('confirm', weights)
  dialogVisible.value = false
}
</script>

<style scoped>
.weight-balancer {
  padding: 10px;
}

.sliders-container {
  display: flex;
  gap: 4px;
  justify-content: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.slider-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 24px;
  padding: 8px 4px;
}

.slider-item.first-slider {
  background-color: #f5f5f5;
  border-radius: 6px;
  padding: 8px 4px;
}

.slider-label {
  font-size: 12px;
  margin-top: 1px;
  text-align: center;
  font-weight: 500;
  min-height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1.2;
  color: #606266;
}

.slider-track {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  height: 80px;
  position: relative;
}

.slider-track::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 2px;
  background-color: #e4e7ed;
  transform: translateX(-50%);
  z-index: 0;
}

.slider-level {
  width: 24px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  z-index: 1;
}

.level-marker {
  width: 10px;
  height: 5px;
  background-color: #c0c4cc;
  border-radius: 2px;
  transition: all 0.2s;
}

.slider-level.active .level-marker {
  background-color: #409eff;
  transform: scale(1.3);
}

.slider-level:hover .level-marker {
  background-color: #79bbff;
}

.slider-value {
  margin-top: 6px;
  font-size: 15px;
  font-weight: bold;
  min-height: 18px;
  min-width: 18px;
  text-align: center;
}

.slider-value.positive {
  color: #409eff;
}

.slider-value.negative {
  color: #f56c6c;
}

.slider-value.zero {
  color: #909399;
}

.action-buttons {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 10px;
}
</style>
