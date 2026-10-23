<template>
  <div class="doc-overlay" v-if="visible" @click.self="close">
    <div class="doc-window">
      <div class="doc-sidebar">
        <ul>
          <li v-for="(topic, index) in topics"
              :key="index"
              @click="selectTopic(index)"
              :class="{ active: index === selectedTopic }">
            {{ topic.title }}
          </li>
        </ul>
      </div>
      <div class="doc-content" v-html="currentTopicContent"></div>
      <button class="close-btn" @click="close">×</button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, watch } from 'vue';
import { marked } from 'marked';

export default defineComponent({
  name: 'Documentation',
  props: {
    visible: {
      type: Boolean,
      required: true,
    },
  },
  emits: ['close'],
  setup(props, { emit }) {
    const topics = ref([
      { title: '总览', file: '总览.md' },
      { title: '游戏模式', file: '游戏模式.md' },
      { title: '标准赛规则', file: '标准赛规则.md' },
      { title: '双面赛规则', file: '双面赛规则.md' },
      { title: 'BP赛规则', file: 'BP赛规则.md' },
      { title: '标准赛生成', file: '标准赛生成.md' },
      { title: '双面赛生成', file: '双面赛生成.md' },
      { title: '已有卡池', file: '已有卡池.md' },
      { title: '自定义卡池', file: '自定义卡池.md' },
      { title: '盲盒设定', file: '盲盒设定.md' },
      { title: '双重盘面设定', file: '双重盘面设定.md' },
      { title: 'AI练习设定', file: 'AI练习设定.md' },
      { title: 'AI参数与符卡数据', file: 'AI参数与符卡数据.md' },
      { title: '作品生成权重', file: '作品生成权重.md' },
      { title: '史难度', file: '史难度.md' },
      { title: '自定义难度', file: '自定义难度.md' },
      { title: '杂项设定', file: '杂项设定.md' },
      { title: '记录与回放', file: '记录与回放.md' },
    ]);

    const selectedTopic = ref(0);
    const markdownContent = ref('');

    const loadContent = async (fileName: string) => {
      try {
        const response = await fetch(`/docs/${fileName}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        markdownContent.value = await response.text();
      } catch (error) {
        console.error('Error loading documentation content:', error);
        markdownContent.value = '# Error\nCould not load content.';
      }
    };

    const currentTopicContent = computed(() => {
      // Ensure markdownContent is a string before passing to marked
      return marked(markdownContent.value || '');
    });

    const selectTopic = (index: number) => {
      selectedTopic.value = index;
      localStorage.setItem('doc_last_page', index.toString());
    };

    const close = () => {
      emit('close');
    };

    watch(selectedTopic, (newIndex) => {
      if (topics.value[newIndex]) {
        loadContent(topics.value[newIndex].file);
      }
    }, { immediate: true });

    onMounted(() => {
      const lastPage = localStorage.getItem('doc_last_page');
      if (lastPage) {
        const pageIndex = parseInt(lastPage, 10);
        if (pageIndex >= 0 && pageIndex < topics.value.length) {
          selectedTopic.value = pageIndex;
        }
      }
    });

    return {
      topics,
      selectedTopic,
      selectTopic,
      currentTopicContent,
      close,
    };
  },
});
</script>

<style scoped>
.doc-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.25);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.doc-window {
  width: 80%;
  height: 80%;
  background-color: #ffffff;
  border-radius: 8px;
  display: flex;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  position: relative;
  border: 1px solid #ebeef5;
  overflow: hidden; /* Prevents content from overflowing rounded corners */
}

.doc-sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid #ebeef5;
  padding: 16px;
  overflow-y: auto;
  background-color: #f5f7fa;
}

.doc-sidebar ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.doc-sidebar li {
  padding: 10px 15px;
  cursor: pointer;
  border-radius: 4px;
  color: #303133;
  transition: background-color 0.3s, color 0.3s;
  word-wrap: break-word;
}

.doc-sidebar li:hover {
  background-color: #e9eef3;
}

.doc-sidebar li.active {
  background-color: #409eff;
  color: #ffffff;
  font-weight: bold;
}

.doc-content {
  flex-grow: 1;
  padding: 20px 40px; /* More horizontal padding */
  overflow-y: auto;
  text-align: justify;
  line-height: 1.7; /* Increased line height for readability */
  color: #303133;
}

.close-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: #909399;
  transition: color 0.3s;
}

.close-btn:hover {
  color: #303133;
}

/* Deep selector for styling v-html content */
.doc-content ::v-deep(h1),
.doc-content ::v-deep(h2),
.doc-content ::v-deep(h3),
.doc-content ::v-deep(h4) {
  color: #303133;
  margin-top: 1.5em;
  margin-bottom: 0.8em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid #ebeef5;
  text-align: left;
}

.doc-content ::v-deep(h1) {
  font-size: 2em;
}

.doc-content ::v-deep(h2) {
  font-size: 1.5em;
}

.doc-content ::v-deep(p) {
  margin-bottom: 1em;
}

.doc-content ::v-deep(a) {
  color: #409eff;
  text-decoration: none;
  font-weight: 500;
}

.doc-content ::v-deep(a:hover) {
  text-decoration: underline;
}

.doc-content ::v-deep(ul),
.doc-content ::v-deep(ol) {
  padding-left: 2em;
  margin-bottom: 1em;
  text-align: left;
}

.doc-content ::v-deep(li) {
  margin-bottom: 0.5em;
}

.doc-content ::v-deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5em 0;
  box-shadow: 0 0 5px rgba(0,0,0,0.05);
}

.doc-content ::v-deep(th),
.doc-content ::v-deep(td) {
  border: 1px solid #ebeef5;
  padding: 12px 15px;
  text-align: left;
}

.doc-content ::v-deep(th) {
  background-color: #f5f7fa;
  font-weight: 600;
  color: #606266;
}

.doc-content ::v-deep(tr:nth-child(even)) {
  background-color: #fafafa;
}

.doc-content ::v-deep(pre) {
  background-color: #f5f7fa;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 1em;
  overflow-x: auto;
  margin: 1.5em 0;
}

.doc-content ::v-deep(code) {
  font-family: 'Courier New', Courier, monospace;
  background-color: #e9eef3;
  color: #c0341d;
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-size: 0.9em;
}

.doc-content ::v-deep(pre) > code {
  background-color: transparent;
  padding: 0;
  color: inherit;
}

.doc-content ::v-deep(blockquote) {
  margin: 1.5em 0;
  padding: 0.5em 1.5em;
  border-left: 4px solid #409eff;
  background-color: #f5f7fa;
  color: #606266;
}

.doc-content ::v-deep(hr) {
  border: none;
  border-top: 1px solid #ebeef5;
  margin: 2em 0;
}
</style>
