import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { local } from "@/utils/Storage";
import adminApi from "@/utils/adminApi";

const ADMIN_AUTH_KEY = "adminAuth";

export const useAdminStore = defineStore("admin", () => {
  const savedAuth = local.get(ADMIN_AUTH_KEY) || {};

  const token = ref(savedAuth.token || "");
  const username = ref(savedAuth.username || "");
  const expiresAt = ref(savedAuth.expires_at || 0);

  const isAuthenticated = computed(() => {
    if (!token.value) {
      return false;
    }
    if (!expiresAt.value) {
      return true;
    }
    return expiresAt.value > Date.now();
  });

  const persist = () => {
    if (!token.value) {
      local.remove(ADMIN_AUTH_KEY);
      return;
    }
    local.set(ADMIN_AUTH_KEY, {
      token: token.value,
      username: username.value,
      expires_at: expiresAt.value,
    });
  };

  watch([token, username, expiresAt], persist, { immediate: true });

  const login = async (account: string, password: string) => {
    const response = await adminApi.login(account, password);
    token.value = response.token;
    username.value = response.username;
    expiresAt.value = response.expires_at;
    return response;
  };

  const logout = () => {
    token.value = "";
    username.value = "";
    expiresAt.value = 0;
    local.remove(ADMIN_AUTH_KEY);
  };

  const handleUnauthorized = () => {
    logout();
  };

  if (token.value && !isAuthenticated.value) {
    logout();
  }

  return {
    token,
    username,
    expiresAt,
    isAuthenticated,
    login,
    logout,
    handleUnauthorized,
  };
});
