import { computed, ref } from "vue";
import { defineStore } from "pinia";
import ws from "@/utils/webSocket/WebSocketBingo";
import { WebSocketActionType } from "@/utils/webSocket/types";
import { Spell } from "@/types";
import { deflateToBase64, ungzipFromBase64 } from "@/utils/CustomCardPool";

export interface GameInfo {
  code: string;
  name: string;
}

export interface OnlinePoolMetadata {
  md5: string;
  uploader_name: string;
  file_name: string;
  note: string;
  row_count: number;
  game_count: number;
  games: GameInfo[];
  created_at: number;
  expires_at: number;
}

export interface OnlinePoolDetail {
  metadata: OnlinePoolMetadata;
  spells: Spell[];
}

export const useOnlineCustomPoolStore = defineStore("onlineCustomPool", () => {
  const poolList = ref<OnlinePoolMetadata[]>([]);
  const selectedMd5 = ref<string | null>(null);
  const loading = ref(false);

  const selectedPool = computed(() =>
    poolList.value.find((p) => p.md5 === selectedMd5.value) || null
  );

  const isPoolSelected = computed(() => selectedMd5.value !== null);

  const selectedGames = computed<GameInfo[]>(() => selectedPool.value?.games || []);

  const selectedGameCodes = computed(() => selectedGames.value.map((g) => g.code));

  async function fetchPoolList() {
    loading.value = true;
    try {
      poolList.value = (await ws.send(WebSocketActionType.LIST_CUSTOM_POOLS)) || [];
    } finally {
      loading.value = false;
    }
  }

  async function fetchPoolDetail(md5: string): Promise<OnlinePoolDetail> {
    const response = await ws.send(WebSocketActionType.GET_CUSTOM_POOL, { md5 });
    if (response.spells_compressed) {
      const json = ungzipFromBase64(response.spells_compressed);
      return { metadata: response.metadata, spells: JSON.parse(json) };
    }
    return response;
  }

  async function uploadPool(
    fileName: string,
    note: string,
    xlsxBase64: string,
    spellsJson: string,
    gamesJson: string
  ): Promise<OnlinePoolMetadata> {
    return await ws.send(WebSocketActionType.UPLOAD_CUSTOM_POOL, {
      xlsx_base64: xlsxBase64,
      file_name: fileName,
      note,
      spells_compressed: deflateToBase64(spellsJson),
      games_compressed: deflateToBase64(gamesJson),
    });
  }

  async function deletePool(md5: string) {
    await ws.send(WebSocketActionType.DELETE_CUSTOM_POOL, { md5 });
    poolList.value = poolList.value.filter((p) => p.md5 !== md5);
    if (selectedMd5.value === md5) {
      selectedMd5.value = null;
    }
  }

  function selectPool(md5: string | null) {
    selectedMd5.value = md5;
  }

  async function getSpells(md5: string): Promise<Spell[]> {
    const detail = await fetchPoolDetail(md5);
    return detail.spells;
  }

  return {
    poolList,
    selectedMd5,
    selectedPool,
    isPoolSelected,
    loading,
    selectedGames,
    selectedGameCodes,
    fetchPoolList,
    fetchPoolDetail,
    uploadPool,
    deletePool,
    selectPool,
    getSpells,
  };
});
