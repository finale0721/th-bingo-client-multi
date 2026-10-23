import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { local } from "@/utils/Storage";
import {
  CustomCardPoolPayload,
  CustomCardPoolSlot,
  customPoolToSpells,
  exportCustomCardPool,
  exportCustomCardPoolTemplate,
  getCustomPoolGames,
  readCustomCardPoolFile,
} from "@/utils/CustomCardPool";

const STORAGE_KEY = "custom_card_pool_slots";
const SELECTED_KEY = "custom_card_pool_selected_id";
const SLOT_COUNT = 10;

const normalizeSlots = (source: unknown): Array<CustomCardPoolSlot | null> => {
  const arr = Array.isArray(source) ? source : [];
  return Array.from({ length: SLOT_COUNT }, (_, index) => {
    const slot = arr[index];
    if (!slot || !slot.payload || !Array.isArray(slot.payload.rows)) return null;
    return {
      id: index,
      note: String(slot.note || ""),
      fileName: String(slot.fileName || `自定义卡池${index + 1}.xlsx`),
      updatedAt: Number(slot.updatedAt || Date.now()),
      payload: slot.payload as CustomCardPoolPayload,
    };
  });
};

export const useCustomCardPoolStore = defineStore("customCardPool", () => {
  const slots = ref<Array<CustomCardPoolSlot | null>>(normalizeSlots(local.get(STORAGE_KEY)));
  const selectedId = ref<number | null>(local.get(SELECTED_KEY));

  const persist = () => {
    local.set(STORAGE_KEY, slots.value);
    local.set(SELECTED_KEY, selectedId.value);
  };

  const selectedSlot = computed(() => {
    if (selectedId.value == null) return null;
    return slots.value[selectedId.value] || null;
  });

  const selectedPayload = computed(() => selectedSlot.value?.payload || null);
  const selectedGames = computed(() => getCustomPoolGames(selectedPayload.value));
  const selectedGameCodes = computed(() => selectedGames.value.map((item) => item.code));

  const importFileToSlot = async (slotId: number, file: File) => {
    const payload = await readCustomCardPoolFile(file);
    slots.value[slotId] = {
      id: slotId,
      note: slots.value[slotId]?.note || "",
      fileName: file.name,
      updatedAt: Date.now(),
      payload,
    };
    persist();
    return slots.value[slotId]!;
  };

  const deleteSlot = (slotId: number) => {
    slots.value[slotId] = null;
    if (selectedId.value === slotId) selectedId.value = null;
    persist();
  };

  const updateNote = (slotId: number, note: string) => {
    const slot = slots.value[slotId];
    if (!slot) return;
    slot.note = note;
    slot.updatedAt = Date.now();
    persist();
  };

  const selectSlot = (slotId: number | null) => {
    if (slotId != null && !slots.value[slotId]) return;
    selectedId.value = slotId;
    persist();
  };

  const exportSlot = (slotId: number) => {
    const slot = slots.value[slotId];
    if (!slot) return;
    exportCustomCardPool(slot.payload, slot.fileName || `自定义卡池${slotId + 1}.xlsx`);
  };

  const exportTemplateFromSlot = (slotId?: number) => {
    const slot = slotId == null ? selectedSlot.value : slots.value[slotId];
    if (!slot) throw new Error("请先选择或导入一个卡池");
    exportCustomCardPoolTemplate(slot.payload);
  };

  const selectedSpells = (useBpStar = false) =>
    selectedPayload.value ? customPoolToSpells(selectedPayload.value, useBpStar) : [];

  return {
    slots,
    selectedId,
    selectedSlot,
    selectedPayload,
    selectedGames,
    selectedGameCodes,
    importFileToSlot,
    deleteSlot,
    updateNote,
    selectSlot,
    exportSlot,
    exportTemplateFromSlot,
    selectedSpells,
  };
});
