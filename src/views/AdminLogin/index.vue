<template>
  <div class="admin-login">
    <div class="login-panel">
      <div class="copy">
        <p class="eyebrow">TFCC Admin</p>
        <h1>对局数据后台登录</h1>
        <p>使用独立管理员账号进入 Replay 数据后台，查看对局归档、活跃分析和批量导出功能。</p>
      </div>

      <el-form @submit.prevent="submitLogin">
        <el-form-item>
          <el-input v-model="username" placeholder="管理员账号" clearable />
        </el-form-item>
        <el-form-item>
          <el-input v-model="password" type="password" placeholder="管理员密码" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" class="submit-btn" @click="submitLogin">登录后台</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { ElButton, ElForm, ElFormItem, ElInput, ElMessage } from "element-plus";
import { useAdminStore } from "@/store/AdminStore";

const router = useRouter();
const adminStore = useAdminStore();

const username = ref(adminStore.username || "admin");
const password = ref("");
const loading = ref(false);

const submitLogin = async () => {
  if (!username.value.trim() || !password.value) {
    ElMessage.error("请输入管理员账号和密码");
    return;
  }

  loading.value = true;
  try {
    await adminStore.login(username.value.trim(), password.value);
    router.push("/admin");
  } catch (error) {
    const err = error as Error;
    ElMessage.error(err.message || "管理员登录失败");
  } finally {
    loading.value = false;
  }
};
</script>

<style lang="scss" scoped>
.admin-login {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
  background:
    radial-gradient(circle at top left, rgba(91, 191, 236, 0.18), transparent 28%),
    linear-gradient(140deg, rgba(7, 24, 36, 0.98), rgba(11, 55, 78, 0.92));
}

.login-panel {
  width: min(460px, 100%);
  padding: 34px 30px 26px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
}

.copy {
  margin-bottom: 22px;
  text-align: left;
}

.eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: #2d87be;
}

h1 {
  margin: 0 0 12px;
  color: #132b3b;
  font-size: 30px;
}

p {
  margin: 0;
  color: #5d7584;
  line-height: 1.7;
}

.submit-btn {
  width: 100%;
}

:deep(.el-input__wrapper) {
  box-shadow: none;
  border: 1px solid rgba(10, 41, 60, 0.12);
}
</style>
