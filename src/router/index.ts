import { createRouter, createWebHashHistory, RouteRecordRaw } from "vue-router";
import { useRoomStore } from "@/store/RoomStore";
import { useLocalStore } from "@/store/LocalStore";
import { useAdminStore } from "@/store/AdminStore";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    name: "Layout",
    component: () => import("@/views/Layout/index.vue"),
    children: [
      {
        path: "/",
        name: "Home",
        component: () => import("@/views/Home/index.vue"),
      },
      {
        path: "/room/:rid",
        name: "Room",
        component: () => import("@/views/Room/index.vue"),
      },
    ],
  },
  {
    path: "/login",
    name: "Login",
    component: () => import("@/views/Login/index.vue"),
  },
  {
    path: "/admin/login",
    name: "AdminLogin",
    meta: { admin: true, adminGuestOnly: true },
    component: () => import("@/views/AdminLogin/index.vue"),
  },
  {
    path: "/admin",
    name: "Admin",
    meta: { admin: true },
    component: () => import("@/views/Admin/index.vue"),
  },
];

const router = createRouter({
  history: createWebHashHistory(process.env.BASE_URL),
  routes,
});

router.beforeEach(async (to, from, next) => {
  if (to.meta.admin) {
    const adminStore = useAdminStore();

    if (to.meta.adminGuestOnly) {
      if (adminStore.isAuthenticated) {
        next("/admin");
        return;
      }
      next();
      return;
    }

    if (!adminStore.isAuthenticated) {
      next("/admin/login");
      return;
    }

    next();
    return;
  }

  const roomStore = useRoomStore();
  const localStore = useLocalStore();

  if (to.path === "/login") {
    if (localStore.online) {
      next("/");
      return;
    }
  } else {
    if (!localStore.online) {
      next("/login");
      return;
    }
  }

  if (to.path.startsWith("/room") && !roomStore.roomId && to.params.rid) {
    next("/");
    return;
  }

  next();
});

export default router;
