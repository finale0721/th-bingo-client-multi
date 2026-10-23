import { defineStore } from "pinia";
import { computed, nextTick, ref, watch } from "vue";
import ws from "@/utils/webSocket/WebSocketBingo";
import { WebSocketActionType, WebSocketPushActionType, WebSocketEventType } from "@/utils/webSocket/types";
import { local } from "@/utils/Storage";
import { useRoomStore } from "./RoomStore";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";

export const useLocalStore = defineStore("local", () => {
  const roomStore = useRoomStore();
  const router = useRouter();

  //用户数据
  const online = ref(false);
  watch(online, (flag) => {
    nextTick(() => {
      if (flag) {
        if (!roomStore.roomId) {
          router.push("/");
        }
      } else {
        router.push("/login");
      }
    });
  });

  const username = ref("");
  const password = ref("");
  const savedUserData = local.get("userData");
  if (savedUserData) {
    username.value = savedUserData.username;
    password.value = savedUserData.password;
  }

  const userData = computed(() => ({
    username: username.value,
    password: password.value,
  }));

  const login = () => {
    if (!username.value || !password.value) return;
    // 未连接时不在这里发送：连接建立后的 CONNECT 回调会用当前的账号密码自动登录
    if (!ws.connected) return;
    return ws
      .send(WebSocketActionType.LOGIN, {
        name: username.value,
        pwd: password.value,
      })
      .then((res: any) => {
        local.set("userData", userData.value);
        res && res.rid && (roomStore.roomId = res.rid);
        online.value = true;
      })
      .catch((e) => {});
  };

  // 服务端把登录态绑定在连接(channel)上：断线重连后新连接没有任何身份映射，
  // 必须在每次连接建立后重新登录，否则后续所有请求都会收到 You haven't login
  ws.on(WebSocketEventType.CONNECT, login);
  if (ws.connected) login(); // 兜底：连接建立早于 store 初始化时不会再触发 CONNECT

  //传输层连接状态三态，驱动在线指示器：online=绿(已连接) connecting=黄(连接中/掉线自动重连中) offline=红(重试耗尽)
  const connStatus = ref<"online" | "connecting" | "offline">(ws.connected ? "online" : "connecting");
  ws.on(WebSocketEventType.CONNECT, () => (connStatus.value = "online"));
  ws.on(WebSocketEventType.DISCONNECT, () => (connStatus.value = "connecting"));
  ws.on(WebSocketEventType.ERROR, () => (connStatus.value = "connecting"));
  ws.on(WebSocketEventType.OFFLINE, () => (connStatus.value = "offline"));

  const logout = () => {
    if (roomStore.inRoom) {
      return ws.send(WebSocketActionType.LEAVE_ROOM).then(() => {
        roomStore.roomId = "";
        username.value = "";
        password.value = "";
        local.remove("userData");
        online.value = false;
        ws.reconnect();
      });
    } else {
      return new Promise((reslove, reject) => {
        username.value = "";
        password.value = "";
        local.remove("userData");
        online.value = false;
        ws.reconnect();
        reslove(null);
      });
    }
  };
  ws.on<{ now: number }>(WebSocketPushActionType.PUSH_KICK, () => {
    logout();
    ElMessage.error("该账号在别处登录");
  });

  //时间
  const localTime = ref(new Date().getTime());
  const serverTime = ref(0);
  const ping = ref(0);
  watch(localTime, (time) => {
    ping.value = time - ws.heartBeatSendTime;
  });
  const timeMistake = computed(() => serverTime.value - localTime.value);
  ws.on<{ now: number }>(WebSocketActionType.HEART, (data) => {
    serverTime.value = data!.now;
    localTime.value = new Date().getTime();
  });

  return {
    username,
    password,
    userData,
    localTime,
    serverTime,
    ping,
    timeMistake,
    online,
    connStatus,
    login,
    logout,
  };
});
