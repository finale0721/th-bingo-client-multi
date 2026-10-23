import Config from "@/config";
import type {
  AdminGameRecord,
  AdminLoginResponse,
  AdminMatchBatchResponse,
  AdminMatchListResponse,
  AdminUserOverviewResponse,
} from "@/types/admin";

interface ApiEnvelope<T> {
  code: number;
  msg: string;
  data: T;
}

export interface MatchQuery {
  keyword?: string;
  from?: number;
  to?: number;
  save_reason?: string;
  limit?: number;
}

const resolveAdminApiBase = () => {
  const explicitBase = process.env.VUE_APP_ADMIN_API;
  if (explicitBase) {
    return explicitBase.replace(/\/$/, "");
  }

  const wsUrl = Config.webSocket.url;
  if (wsUrl) {
    const parsedUrl = new URL(wsUrl);
    parsedUrl.protocol = parsedUrl.protocol === "wss:" ? "https:" : "http:";
    parsedUrl.pathname = "/admin-api";
    parsedUrl.search = "";
    parsedUrl.hash = "";
    return parsedUrl.toString().replace(/\/$/, "");
  }

  return `${window.location.protocol}//${window.location.hostname}:9999/admin-api`;
};

const ADMIN_API_BASE = resolveAdminApiBase();

const createApiError = (message: string, code: number) => {
  const error = new Error(message) as Error & { code?: number };
  error.code = code;
  return error;
};

const request = async <T>(path: string, init: RequestInit = {}, token = ""): Promise<T> => {
  const headers = new Headers(init.headers || {});

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${ADMIN_API_BASE}${path}`, {
    ...init,
    headers,
  });

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch (error) {
    throw createApiError("Admin API 响应解析失败", response.status || 500);
  }

  if (!response.ok || payload.code !== 0) {
    throw createApiError(payload.msg || "Admin API 请求失败", payload.code || response.status || 500);
  }

  return payload.data;
};

const buildQueryString = (query: MatchQuery) => {
  const search = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    search.append(key, String(value));
  });
  const queryString = search.toString();
  return queryString ? `?${queryString}` : "";
};

export const adminApi = {
  login(username: string, password: string) {
    return request<AdminLoginResponse>("/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  getMatches(query: MatchQuery, token: string) {
    return request<AdminMatchListResponse>(`/matches${buildQueryString(query)}`, { method: "GET" }, token);
  },
  getMatch(id: string, token: string) {
    return request<AdminGameRecord>(`/matches/${id}`, { method: "GET" }, token);
  },
  getMatchesBatch(ids: string[], token: string) {
    return request<AdminMatchBatchResponse>(
      "/matches/batch",
      {
        method: "POST",
        body: JSON.stringify({ ids }),
      },
      token,
    );
  },
  getUserOverview(query: MatchQuery, token: string) {
    return request<AdminUserOverviewResponse>(
      `/analytics/user-overview${buildQueryString(query)}`,
      { method: "GET" },
      token,
    );
  },
};

export default adminApi;
