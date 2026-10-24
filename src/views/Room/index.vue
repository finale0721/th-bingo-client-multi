<template>
  <div class="room">
    <room-layout
      ref="layoutRef"
      v-model="selectedSpellIndex"
      :menu="menu"
      :multiple="isBingoBp || (isBingoStandard && gameStore.gameStatus === GameStatus.COUNT_DOWN)"
      :is-editor-mode="editorStore.isEditorMode"
      @editor-cell-click="handleEditorCellClick"
    >
      <template #left>
        <score-board
          class="change-card"
          v-if="isBingoStandard"
          :size="48"
          :manual="isHost"
          label="换卡次数"
          v-model="roomData.change_card_count[0]"
          @add="addChangeCardCount(0)"
          @minus="removeChangeCardCount(0)"
          :disabled="!inGame"
        ></score-board>
        <div v-if="isBingoStandard && gameStore.changePending && myTeam === 0" class="change-pending">换卡待结算</div>
        <score-board class="spell-card-score-card" :size="30" label="得分" v-model="playerAScore"></score-board>
        <score-board class="spell-card-score-card" :size="30" :label="isBingoLink ? '已收等级' : '等级'" v-model="playerALevel"></score-board>
        <score-board
          v-if="isBingoLink"
          class="spell-card-score-card"
          :size="30"
          label="剩余跳过"
          :manual="canManageLinkA"
          :model-value="linkSkipRemainA"
          :min="0"
          :max="linkSkipLimit(routeA)"
          @add="setLinkSkipRemain(0, linkSkipRemainA + 1)"
          @minus="setLinkSkipRemain(0, linkSkipRemainA - 1)"
          :disabled="!inGame"
        ></score-board>
        <div v-if="isBingoLink && inGame" class="link-board-summary link-board-summary-a">
          <span>路线 {{ routeA.length }} / 等级分 {{ linkRouteScoreA }}</span>
          <span v-if="linkRouteFastestA > 0">理论 {{ linkRouteFastestA }}s</span>
          <span>用时 {{ formatLinkDuration(linkEffectiveUsedMsA) }}</span>
          <span v-if="linkCdLeftA > 0">CD {{ Math.ceil(linkCdLeftA / 1000) }}s</span>
        </div>
        <div v-if="isBingoLink && canManageLinkA && linkPhase === 2" class="link-manage-buttons">
          <el-button size="small" @click="forceLinkSkip(0)" :disabled="linkPlayerFinished(0) || linkCdLeftA > 0">强制跳过</el-button>
          <el-button size="small" @click="undoLinkFinish(0)" :disabled="linkData.current_step_a <= 0">撤销收取</el-button>
        </div>
        <div v-if="isBingoLink && canTakeover && linkPhase === 1" class="link-manage-buttons" :key="'tk-ctrl-a-' + takeoverUiKey">
          <el-button v-show="takeoverPlayerIndex !== 0" size="small" @click="takeoverRoute(0)">接管路线</el-button>
          <el-button v-show="takeoverPlayerIndex === 0" size="small" type="warning" @click="releaseTakeover">释放接管</el-button>
        </div>
        <div v-if="isBingoLink && linkPhase === 1 && takeoverPlayerIndex === 0 && !isOwner" class="link-manage-buttons" :key="'tk-lock-a-' + takeoverUiKey">
          <span style="color: #e6a23c; font-size: 12px;">路线已被接管</span>
        </div>
        <div class="warn-controls" v-if="isHost && inGame && !roomData.practice && teamMembers(0).length > 0">
          <el-select v-model="warnTargetA" placeholder="选择成员" size="small" class="warn-select">
            <el-option v-for="m in teamMembers(0)" :key="m.name" :label="m.name" :value="m.name" />
          </el-select>
          <el-button class="alert-button" type="primary" size="small" :disabled="!warnTargetA" @click="warnPlayer(warnTargetA)">
            警告
          </el-button>
        </div>
      </template>

      <template #right>
        <template v-if="!roomData.practice">
        <score-board
          class="change-card"
          v-if="isBingoStandard"
          :size="48"
          :manual="isHost"
          label="换卡次数"
          v-model="roomData.change_card_count[1]"
          @add="addChangeCardCount(1)"
          @minus="removeChangeCardCount(1)"
          :disabled="!inGame"
        ></score-board>
        <div v-if="isBingoStandard && gameStore.changePending && myTeam === 1" class="change-pending">换卡待结算</div>
        <score-board class="spell-card-score-card" :size="30" label="得分" v-model="playerBScore"></score-board>
        <score-board class="spell-card-score-card" :size="30" :label="isBingoLink ? '已收等级' : '等级'" v-model="playerBLevel"></score-board>
        </template>
        <div v-else class="no-opponent-side">无对手</div>
        <score-board
          v-if="isBingoLink"
          class="spell-card-score-card"
          :size="30"
          label="剩余跳过"
          :manual="canManageLinkB"
          :model-value="linkSkipRemainB"
          :min="0"
          :max="linkSkipLimit(routeB)"
          @add="setLinkSkipRemain(1, linkSkipRemainB + 1)"
          @minus="setLinkSkipRemain(1, linkSkipRemainB - 1)"
          :disabled="!inGame"
        ></score-board>
        <div v-if="isBingoLink && inGame" class="link-board-summary link-board-summary-b">
          <span>路线 {{ routeB.length }} / 等级分 {{ linkRouteScoreB }}</span>
          <span v-if="linkRouteFastestB > 0">理论 {{ linkRouteFastestB }}s</span>
          <span>用时 {{ formatLinkDuration(linkEffectiveUsedMsB) }}</span>
          <span v-if="linkCdLeftB > 0">CD {{ Math.ceil(linkCdLeftB / 1000) }}s</span>
        </div>
        <div v-if="isBingoLink && canManageLinkB && linkPhase === 2" class="link-manage-buttons">
          <el-button size="small" @click="forceLinkSkip(1)" :disabled="linkPlayerFinished(1) || linkCdLeftB > 0">强制跳过</el-button>
          <el-button size="small" @click="undoLinkFinish(1)" :disabled="linkData.current_step_b <= 0">撤销收取</el-button>
        </div>
        <div v-if="isBingoLink && canTakeover && linkPhase === 1" class="link-manage-buttons" :key="'tk-ctrl-b-' + takeoverUiKey">
          <el-button v-show="takeoverPlayerIndex !== 1" size="small" @click="takeoverRoute(1)">接管路线</el-button>
          <el-button v-show="takeoverPlayerIndex === 1" size="small" type="warning" @click="releaseTakeover">释放接管</el-button>
        </div>
        <div v-if="isBingoLink && linkPhase === 1 && takeoverPlayerIndex === 1 && !isOwner" class="link-manage-buttons" :key="'tk-lock-b-' + takeoverUiKey">
          <span style="color: #e6a23c; font-size: 12px;">路线已被接管</span>
        </div>
        <div v-if="showLinkAiSpeedrun" class="link-manage-buttons">
          <el-button size="small" type="warning" @click="linkAiSpeedrun" :disabled="linkPlayerFinished(1)">速通</el-button>
        </div>
        <div class="warn-controls" v-if="isHost && inGame && !roomData.practice && teamMembers(1).length > 0">
          <el-select v-model="warnTargetB" placeholder="选择成员" size="small" class="warn-select">
            <el-option v-for="m in teamMembers(1)" :key="m.name" :label="m.name" :value="m.name" />
          </el-select>
          <el-button class="alert-button" type="primary" size="small" :disabled="!warnTargetB" @click="warnPlayer(warnTargetB)">
            警告
          </el-button>
        </div>
      </template>

      <template #extra>
        <game-bp v-if="isBpPhase" v-model="bpCode"></game-bp>
        <div
          :class="{ page: gameStore.currentBoard === 0, 'page-reverse': gameStore.currentBoard === 1 }"
          v-if="isDualBoard"
        ></div>
      </template>

      <template #widget>
        <count-down
          ref="countdownRef"
          :size="30"
          @complete="onCountDownComplete"
          v-show="
            !gameStore.isReplayMode &&
            ((isBingoStandard && inGame) ||
              (isBingoBp && gameStore.gameStatus === GameStatus.COUNT_DOWN) ||
              (isBingoLink && inGame && linkPhase === 1))
          "
        ></count-down>
      </template>

      <template #button-center>
        <div v-if="gameStore.isReplayMode" class="replay-controls">
          <!-- 调速-->
          <el-slider
            v-model="replaySpeed"
            :marks="speedMarks"
            :step="1"
            :min="1"
            :max="8"
            style="width: 144px; margin: 0 15px"
            @change="changeReplaySpeed"
          />
          <el-button
            :icon="ArrowLeft"
            @click="jumpToPreviousReplayAction"
            :disabled="replayInstance.state.currentTime <= 0"
            circle
          />

          <!-- 回放控制按钮 -->
          <el-button
            :icon="replayInstance.state.isPlaying ? VideoPause : VideoPlay"
            @click="toggleReplay"
            :disabled="replayInstance.state.isReplayFinished"
            circle
          />
          <el-button
            :icon="ArrowRight"
            @click="jumpToNextReplayAction"
            :disabled="replayInstance.state.currentTime <= 0"
            circle
          />
          <!-- 回放进度条-->
          <el-slider
            v-if="replayInstance.state.totalTime > 0"
            v-model="replayInstance.state.currentTime"
            :max="replayInstance.state.totalTime"
            :format-tooltip="formatReplayTime"
            @change="handleTimelineChange"
            style="width: 144px; margin: 0 15px"
          />

          <div class="replay-time">
            {{ formatReplayTime(replayInstance.state.currentTime) }} /
            {{ formatReplayTime(replayInstance.state.totalTime) }}
          </div>

          <el-button type="primary" @click="confirmExitReplay" style="margin-left: 15px">退出回放</el-button>
        </div>

        <template v-else-if="!editorStore.isEditorMode">
          <template v-if="isHost">
            <el-button type="primary" v-if="!inGame && !isBpPhase" @click="startGame" :disabled="!bothTeamsReady">开始比赛</el-button>
            <el-button type="primary" v-if="isBpPhase" @click="drawSpellCard" :disabled="banPick.phase < 99">
              抽取符卡
            </el-button>
            <el-button type="primary" v-if="inGame && winFlag === 0" @click="stopGame">结束比赛</el-button>
            <el-button type="primary" v-if="winFlag !== 0" @click="confirmWinner">
              确认：{{ winFlag < 0 ? teamLabel(0) : teamLabel(1) }}获胜
            </el-button>
          </template>

          <template v-if="!roomData.host && isCaptainOfTeam(0)">
            <el-button type="primary" v-if="!inGame && !isBpPhase" @click="startGame" :disabled="!bothTeamsReady">开始比赛</el-button>
            <el-button type="primary" v-if="banPick.phase === 9999" @click="drawSpellCard">抽取符卡</el-button>
            <el-button type="primary" v-if="isBingoStandard && winFlag !== 0 && !roomSettings.noWinningDeclaration" @click="confirmWinner">
              确认：{{ winFlag < 0 ? teamLabel(0) : teamLabel(1) }}获胜
            </el-button>
            <el-button type="primary" v-if="isBingoLink && winFlag !== 0" @click="confirmWinner">
              确认：{{ winFlag < 0 ? teamLabel(0) : teamLabel(1) }}获胜
            </el-button>
          </template>

          <template v-if="isPlayer">
            <template v-if="inGame">
              <template v-if="isBingoStandard">
                <confirm-select-button
                  @click="confirmSelect"
                  :disabled="selectedSpellIndex < 0 || gamePaused"
                  v-if="!spellCardSelected"
                  :cooldown="selectCooldown"
                  :immediate="gameStore.gameStatus === GameStatus.STARTED && !gameStore.spellCardGrabbedFlag"
                  :paused="gamePaused"
                  @finish="setCdTime"
                  text="选择符卡"
                ></confirm-select-button>
                <confirm-select-button
                  @click="confirmAttained"
                  v-if="spellCardSelected"
                  :disabled="gameStore.gameStatus !== GameStatus.STARTED"
                  :cooldown="roomSettings.confirmDelay * 1000"
                  :immediate="gameStore.alreadySelectCard"
                  text="确认收取"
                ></confirm-select-button>
                <el-button
                  class="change-card-button"
                  type="warning"
                  @click="useChangeCard"
                  :disabled="changeCardDisabled"
                >
                  换卡<span v-if="gameStore.changePending" class="change-pending-tip">（待结算）</span>
                </el-button>
              </template>
              <template v-if="isBingoBp">
                <el-button
                  type="primary"
                  @click="confirmBp"
                  :disabled="!isMyTurn || !bingoBpPhase || selectedSpellIndex < 0"
                  v-if="!gameStore.bpGameData.ban_pick"
                  >{{ bingoBpPhase ? (isMyTurn ? "选择符卡" : "等待对手选择符卡") : "等待房主操作" }}</el-button
                >
                <el-button
                  type="primary"
                  @click="confirmBp"
                  v-if="gameStore.bpGameData.ban_pick"
                  :disabled="!isMyTurn || !bingoBpPhase || selectedSpellIndex < 0"
                  >{{ bingoBpPhase ? (isMyTurn ? "禁用符卡" : "等待对手禁用符卡") : "等待房主操作" }}</el-button
                >
              </template>
              <template v-if="isBingoLink">
                <el-button
                  type="primary"
                  @click="confirmLinkRoute"
                  :disabled="!linkRouteComplete"
                  v-if="linkPhase === 1"
                  >{{ myLinkRouteConfirmed ? "取消确认" : "确认路线" }}</el-button
                >
                <confirm-select-button
                  v-if="linkPhase === 2 && !myLinkFinished && !myLinkCurrentSelected"
                  @click="linkNextCard"
                  :cooldown="linkCooldown"
                  :immediate="true"
                  text="选择下一张"
                ></confirm-select-button>
                <confirm-select-button
                  v-if="linkPhase === 2 && !myLinkFinished && myLinkCurrentSelected"
                  @click="linkFinishCard"
                  :cooldown="roomSettings.confirmDelay * 1000"
                  :immediate="true"
                  text="确认收取"
                ></confirm-select-button>
                <el-button
                  v-if="linkPhase === 2 && !myLinkFinished"
                  size="small"
                  @click="linkSkipCard"
                  :disabled="!canLinkSkip"
                  >{{ linkSkipButtonText }}</el-button
                >
              </template>
            </template>

            <template v-if="isBpPhase">
              <el-button
                type="primary"
                v-if="banPick.phase > 0 && banPick.phase < 11 && (isCaptainOfTeam(0) || isCaptainOfTeam(1))"
                :disabled="!playerACanBP && !playerBCanBP"
                @click="playerBanPick"
                >确定</el-button
              >
              <el-button type="primary" v-if="banPick.phase === 11" @click="confirmOpenEX(true)">开启</el-button>
              <el-button type="primary" v-if="banPick.phase === 11" @click="confirmOpenEX(false)">不开启</el-button>
            </template>

          </template>

          <template v-if="isBingoLink && isTakeoverActive && isOwner && !isPlayer">
            <template v-if="inGame">
              <el-button
                type="primary"
                @click="confirmLinkRoute"
                :disabled="!linkRouteComplete"
                v-if="linkPhase === 1"
                :key="'tk-confirm-' + takeoverUiKey"
                >{{ myLinkRouteConfirmed ? "取消确认" : "确认路线" }}</el-button
              >
            </template>
          </template>

          <!-- <template v-if="isBingoLink">
          <el-button type="primary" v-if="!inGame">开始比赛</el-button>
          <el-button type="primary" v-else>结束比赛</el-button>
          </template> -->
        </template>

        <template v-else>
          <div>
            <el-button type="primary" @click="editorStore.toggleDatabasePanel">
              {{ editorStore.isDatabasePanelVisible ? "关闭数据库" : "打开数据库" }}
            </el-button>
            <el-button type="primary" @click="editorStore.isPresetManagerVisible = true"> 预设管理 </el-button>
          </div>
        </template>
      </template>

      <template #button-left-1>
        <div v-if="!gameStore.isReplayMode && !editorStore.isEditorMode">
          <template v-if="isHost">
            <template v-if="isBingoStandard || !inGame">
              <el-button size="small" :disabled="inGame" @click="resetRoom">重置房间</el-button>
            </template>
            <template v-else>
              <el-button size="small" :disabled="!inGame" v-if="gamePaused" @click="resumeGame">继续比赛</el-button>
              <el-button size="small" :disabled="!inGame" v-else @click="pauseGame">暂停比赛</el-button>
            </template>
          </template>
          <template v-if="!roomData.host && isCaptainOfTeam(0)">
            <el-button v-if="isPlayerA && !inGame" size="small" @click="resetRoom">重置房间</el-button>
            <el-button v-if="isPlayerA && inGame" size="small" @click="stopGame">结束比赛</el-button>
          </template>
        </div>
        <div v-else-if="editorStore.isEditorMode">
          <el-button type="danger" size="small" @click="handleClearAll">清空格子</el-button>
          <el-button type="warning" size="small" @click="handleShuffleSpells">洗混格子</el-button>
        </div>
      </template>

      <template #button-right-1>
        <div v-if="!gameStore.isReplayMode && !editorStore.isEditorMode">
          <template v-if="isOwner">
            <template v-if="isBingoStandard">
              <template v-if="!isBpPhase">
                <el-button size="small" :disabled="!inGame" v-if="gamePaused" @click="resumeGame">继续比赛</el-button>
                <el-button size="small" :disabled="!inGame" v-else @click="pauseGame">暂停比赛</el-button>
              </template>
              <el-button :disabled="bpStatus !== 5" size="small" v-else @click="startBP">重新BP</el-button>
            </template>
            <template v-if="isBingoBp">
              <el-button size="small" @click="nextRound" :disabled="!inGame || gameStore.bpGameData.ban_pick !== 2"
                >进入下轮</el-button
              >
            </template>
            <template v-if="isBingoLink">
              <el-button
                size="small"
                @click="startLinkRun"
                :disabled="!inGame || linkPhase !== 1 || !bothLinkRoutesConfirmed || isTakeoverActive"
                >开始收卡</el-button
              >
            </template>
          </template>
          <template v-if="isBingoLink && linkPhase === 1 && (isPlayer || (isTakeoverActive && isOwner))">
            <el-button type="primary" @click="linkUndo" :disabled="myLinkRouteConfirmed">撤回路线</el-button>
          </template>
        </div>
      </template>

      <template #button-right-2>
        <template v-if="isDualBoard && roomStore.roomConfig.type == BingoType.STANDARD">
          <el-button type="primary" @click="switchDualBoardSide">切换盘面</el-button>
        </template>
      </template>
    </room-layout>

    <spell-editor-modal
      v-if="editorStore.isEditorModalVisible && editorStore.selectedSpellIndex !== -1"
      :spell="selectedSpellData.spell"
      :status="selectedSpellData.status"
      :is-portal="selectedSpellData.isPortal"
      @confirm="handleEditorConfirm"
      @clear="handleEditorClear"
      @close="editorStore.closeModal()"
    />
    <spell-database-panel v-if="editorStore.isEditorMode" />
    <preset-manager />
    <el-dialog
      :model-value="forceBanExVoteVisible"
      title="强制BanEX"
      width="440px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
      align-center
    >
      <div class="force-ban-ex-content">
        <p>双方选择是否强制BanEX。</p>
        <p>选择强制BanEX：你将跳过本次BP的剩余环节，且本局EX关闭，由对方独立完成剩余BP；双方都选择时，直接结束BP阶段，本局不保不ban且EX关闭。</p>
        <p v-if="myForceBanExVote !== 0" class="force-ban-ex-waiting">已选择，等待对方…</p>
      </div>
      <template #footer>
        <el-button type="danger" :plain="myForceBanExVote !== 1" :disabled="bpSubmitting" @click="confirmForceBanEx">强制BanEX</el-button>
        <el-button type="primary" :plain="myForceBanExVote !== -1" :disabled="bpSubmitting" @click="submitBpCard('-1')">继续正常BP</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { computed, h, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { BingoType, BpStatus, GameStatus, SpellStatus } from "@/types";
import RoomLayout from "./components/roomLayout.vue";
import ScoreBoard from "@/components/score-board.vue";
import CountDown from "@/components/count-down.vue";
import GameBp from "@/components/game-bp.vue";
import ConfirmSelectButton from "@/components/button-with-cooldown.vue";
import { ElButton, ElDialog, ElMessage, ElMessageBox, ElRadio, ElRadioGroup, ElSelect, ElOption, ElSlider } from "element-plus";
import ws from "@/utils/webSocket/WebSocketBingo";
import { useRoomStore } from "@/store/RoomStore";
import { useLocalStore } from "@/store/LocalStore";
import { useGameStore } from "@/store/GameStore";
import { WebSocketActionType, WebSocketPushActionType } from "@/utils/webSocket/types";
import { VideoPlay, VideoPause, ArrowLeft, ArrowRight } from "@element-plus/icons-vue";
import Replay from "@/utils/Replay";
import { useEditorStore } from "@/store/EditorStore";
import SpellEditorModal from "@/components/SpellEditorModal.vue";
import SpellDatabasePanel from "@/components/SpellDatabasePanel.vue";
import PresetManager from "@/components/PresetManager.vue";
import { BoardSpec } from "@/utils/board";
import Config from "@/config";

const roomStore = useRoomStore();
const localStore = useLocalStore();
const gameStore = useGameStore();
const editorStore = useEditorStore();
const replayInstance = Replay;

const countdownRef = ref<InstanceType<typeof CountDown>>();
const layoutRef = ref<InstanceType<typeof RoomLayout>>();

//const selectedSpellIndex = ref(-1);
const winFlag = ref(0);

const gameModeSelectedSpellIndex = ref(-1);
const selectedSpellIndex = computed({
  get: () => {
    // If in editor mode, get the index from the editorStore.
    // Otherwise, get it from our local ref for game mode.
    return editorStore.isEditorMode ? editorStore.selectedSpellIndex : gameModeSelectedSpellIndex.value;
  },
  set: (val) => {
    // The setter is ONLY used by the v-model in game mode.
    // In editor mode, the selection is set directly by our new event handler.
    if (!editorStore.isEditorMode) {
      gameModeSelectedSpellIndex.value = val;
    }
  },
});
const playerALeftCd = computed(() => (gameStore.leftCdTime >= 0 ? gameStore.leftCdTime : roomStore.actualCdTimeA));
const playerBLeftCd = computed(() => (gameStore.leftCdTime >= 0 ? gameStore.leftCdTime : roomStore.actualCdTimeB));

const roomData = computed(() => roomStore.roomData);
const roomSettings = computed(() => roomStore.roomSettings);
const roomConfig = computed(() => roomStore.roomConfig);
const boardSpec = computed(() => new BoardSpec(roomConfig.value.board_size || 5));
const soloMode = computed(() => {
  return roomStore.soloMode;
});
const isHost = computed(() => roomStore.isHost);
const isPlayer = computed(() => roomStore.isPlayer);
const showLinkPlayerControls = computed(() => isPlayer.value || (isBingoLink.value && isTakeoverActive.value && isOwner.value));
const isPlayerA = computed(() => roomStore.isPlayerA);
const isPlayerB = computed(() => roomStore.isPlayerB);
const myTeam = computed(() => roomStore.myTeam);
const isOwner = computed(() => (roomData.value.host ? isHost.value : isCaptainOfTeam(0)));
const bothTeamsReady = computed(() => roomStore.bothTeamsReady);
const showLinkAiSpeedrun = computed(() =>
  isBingoLink.value && inGame.value && roomStore.roomConfig.use_ai && isOwner.value
);

const inMatch = computed(() => roomStore.inMatch);
const isBingoStandard = computed(() => roomStore.roomData.type === BingoType.STANDARD);
const isBingoBp = computed(() => roomStore.roomData.type === BingoType.BP);
const isBingoLink = computed(() => roomStore.roomData.type === BingoType.LINK);

const isDualBoard = computed(() => roomStore.roomConfig.dual_board > 0);

const teamMembers = (team: number) => roomStore.teamMembers(team);
const isCaptainOfTeam = (team: number) =>
  teamMembers(team).some((m) => m.captain && m.name === localStore.username);
const teamLabel = (team: number) => {
  const teamName = team === 0 ? "A队" : "B队";
  const captain = teamMembers(team).find((m) => m.captain);
  return captain ? `${teamName}（${captain.name}）` : teamName;
};
const playerACanBP = computed(
  () =>
    isCaptainOfTeam(0) &&
    (bpStatus.value === BpStatus.IS_A_BAN ||
      bpStatus.value === BpStatus.IS_A_PICK ||
      bpStatus.value === BpStatus.SELECT_OPEN_EX)
);
const playerBCanBP = computed(
  () =>
    isCaptainOfTeam(1) &&
    (bpStatus.value === BpStatus.IS_B_BAN ||
      bpStatus.value === BpStatus.IS_B_PICK ||
      bpStatus.value === BpStatus.SELECT_OPEN_EX)
);
const playerASelectedIndex = computed(() => (myTeam.value === 0 ? gameStore.mySelectedIndex : -1));
const playerBSelectedIndex = computed(() => (myTeam.value === 1 ? gameStore.mySelectedIndex : -1));
const spellCardSelected = computed(() => gameStore.mySelectedIndex !== -1);
const menu = computed<any[]>(() => {
  if (roomData.value.type !== BingoType.STANDARD) return [];
  const canOperate = isHost.value || (!roomData.value.host && isPlayer.value);
  if (!canOperate) return [];
  const items: any[] = [];
  const membersA = teamMembers(0);
  const membersB = teamMembers(1);
  // 两队人数不等时用空占位补齐，保证两列的“收取”选项横向对齐
  const playerRowCount = Math.max(membersA.length, membersB.length);
  for (let i = 0; i < playerRowCount; i++) {
    const m = membersA[i];
    items.push(
      m
        ? { label: `设为选择：${m.name}`, tag: "playerA", op: "toggle_select", name: m.name }
        : { label: "", tag: "playerA", placeholder: true }
    );
  }
  items.push({ label: "A队收取一次", tag: "playerA", op: "capture_once", team: 0 });
  items.push({ label: "A队设为已收取", tag: "playerA", op: "set_captured", team: 0 });
  for (let i = 0; i < playerRowCount; i++) {
    const m = membersB[i];
    items.push(
      m
        ? { label: `设为选择：${m.name}`, tag: "playerB", op: "toggle_select", name: m.name }
        : { label: "", tag: "playerB", placeholder: true }
    );
  }
  items.push({ label: "B队收取一次", tag: "playerB", op: "capture_once", team: 1 });
  items.push({ label: "B队设为已收取", tag: "playerB", op: "set_captured", team: 1 });
  items.push({ label: "置空", op: "clear" });
  return items;
});

const inGame = computed(() => roomStore.inGame);
const isBpPhase = computed(
  () => roomStore.banPick.phase !== 0 && (roomStore.banPick.phase < 99 || gameStore.gameStatus === GameStatus.NOT_STARTED)
);
/** 未开赛提示：区分无导播房、导播房旁观者、导播本人 */
const waitingStartText = computed(() => {
  if (!roomData.value.host) return "等待A队队长开始比赛";
  if (isHost.value) return "请开始比赛";
  return "等待房主开始比赛";
});
onMounted(() => {
  if (!inGame.value && !isBpPhase.value) {
    layoutRef.value?.showAlert(waitingStartText.value, "#000");
  } else {
    layoutRef.value?.hideAlert();
  }
});
watch([inGame, isBpPhase, waitingStartText], ([started, bpPhase, text]) => {
  if (!started && !bpPhase) {
    layoutRef.value?.showAlert(text, "#000");
  } else {
    layoutRef.value?.hideAlert();
  }
});

const gamePaused = computed(() => gameStore.gameStatus === GameStatus.PAUSED);
onMounted(() => {
  if (gamePaused.value) {
    layoutRef.value?.showAlert("游戏已暂停", "#000");
    countdownRef.value?.pause();
  }
});
watch(
  gamePaused,
  (value) => {
    if (value) {
      layoutRef.value?.showAlert("游戏已暂停", "#000");
      countdownRef.value?.pause();
    } else {
      layoutRef.value?.hideAlert();
      if (!isBingoBp.value) {
        nextTick(() => {
          countdownRef.value?.start();
        });
      }
    }
  },
  {
    immediate: true,
  }
);

//赛前BP
const bpCode = ref("");
const banPick = computed(() => roomStore.banPick);
const bpStatus = computed(() => roomStore.bpStatus);
const forceBanExVoteVisible = computed(
  () => banPick.value.phase === -1 && (isCaptainOfTeam(0) || isCaptainOfTeam(1))
);
const myForceBanExVote = computed(() =>
  myTeam.value === 0 ? banPick.value.a_force_ban_ex : myTeam.value === 1 ? banPick.value.b_force_ban_ex : 0
);

const startBP = () => {
  roomStore.startBanPick();
};
// 在途防重：请求发出至响应/推送到达期间忽略重复提交
const bpSubmitting = ref(false);
const submitBpCard = (selection: string) => {
  if (bpSubmitting.value) return;
  bpSubmitting.value = true;
  roomStore
    .banPickCard(selection)
    .catch(() => {})
    .finally(() => {
      bpSubmitting.value = false;
    });
};
watch(
  banPick,
  () => {
    bpSubmitting.value = false;
  },
  { deep: true }
);
const playerBanPick = () => {
  if (!bpCode.value) {
    ElMessageBox.confirm("你没有选择作品，是否确认不选择？", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    })
      .then(() => {
        submitBpCard("");
      })
      .catch(() => {});
  } else {
    submitBpCard(bpCode.value);
  }
};
const confirmOpenEX = (flag: boolean) => {
  submitBpCard(flag ? "1" : "-1");
};
const confirmForceBanEx = () => {
  ElMessageBox.confirm(
    "选择强制BanEX后，你将跳过本次BP的剩余环节。是否确认？",
    "强制BanEX",
    {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      type: "warning",
    }
  )
    .then(() => {
      submitBpCard("1");
    })
    .catch(() => {});
};

//标准赛
const oldSumArr = ref<number[]>([]);
const playerAScore = ref(0);
const playerBScore = ref(0);
const playerALevel = ref(0);
const playerBLevel = ref(0);
const selectCooldown = computed(() => {
  if (!gameStore.inited) {
    return -1;
  }
  const base = myTeam.value === 0 ? roomStore.actualCdTimeA : roomStore.actualCdTimeB;
  return gameStore.leftCdTime >= 0 ? gameStore.leftCdTime : base;
});

const changeCardDisabled = computed(
  () =>
    !inGame.value ||
    gamePaused.value ||
    gameStore.gameStatus === GameStatus.COUNT_DOWN ||
    myTeam.value === null ||
    gameStore.mySelectedIndex === -1 ||
    // 待结算期间再次换卡只取消当前选择，不消耗次数，因此次数为 0 也允许点击
    (!gameStore.changePending && gameStore.changeCardCount[myTeam.value] <= 0)
);
const useChangeCard = () => {
  if (changeCardDisabled.value) return;
  gameStore.changeCard();
};

const setCdTime = () => {
  // CD结束后归零（0=无CD剩余）。不能用-1，否则selectCooldown会回退成"完整CD长度"，
  // 使得按钮下次挂载（例如右键取消选卡）时又凭空开始一次倒计时
  gameStore.leftCdTime = 0;
};

const getStandardSpellStar = (index: number) => {
  if (isDualBoard.value) {
    return Math.max(gameStore.spells[index]?.star || 0, gameStore.spells2[index]?.star || 0);
  }
  return gameStore.spells[index]?.star || 0;
};

const getStandardTieBreakWinner = (cells: any[], countA: number, countB: number, levelA: number, levelB: number) => {
  const board = boardSpec.value;
  if (board.area % 2 !== 0) return 0;
  const halfArea = board.area / 2;
  if (countA !== halfArea && countB !== halfArea) return 0;
  if (levelA === levelB) return 0;
  if (!isDualBoard.value) {
    const totalLevel = gameStore.spells.slice(0, board.area).reduce((sum, spell) => sum + (spell?.star || 0), 0);
    if (countA === halfArea && levelA > totalLevel / 2) return -13;
    if (countB === halfArea && levelB > totalLevel / 2) return 13;
    return 0;
  }
  const remainingMaxLevel = cells.reduce((sum, cell, index) => {
    if (cell?.fully_captured_by !== null && cell?.fully_captured_by !== undefined) return sum;
    return sum + getStandardSpellStar(index);
  }, 0);
  if (countA === halfArea && levelA > levelB && levelA - levelB > remainingMaxLevel) return -13;
  if (countB === halfArea && levelB > levelA && levelB - levelA > remainingMaxLevel) return 13;
  return 0;
};

const decideStandard = (cells: any[]) => {
  const board = boardSpec.value;
  const lines = board.winningLines(gameStore.extraLines || []);
  const lineCount = lines.length;
  const available: number[] = new Array(lineCount).fill(2);
  const sumArr: number[] = new Array(lineCount).fill(0);
  winFlag.value = 0;
  let countA = 0;
  let countB = 0;
  let scoreA = 0;
  let scoreB = 0;
  let levelA = 0;
  let levelB = 0;
  const cellToLines: number[][] = Array.from({ length: board.area }, () => []);
  lines.forEach((line, li) => {
    line.forEach((idx) => cellToLines[idx].push(li));
  });
  cells.forEach((cell: any, index: number) => {
    const owner = cell?.fully_captured_by;
    if (owner === 0) {
      countA++;
      scoreA += 1;
      levelA += getStandardSpellStar(index);
      for (const li of cellToLines[index]) {
        if (available[li] > 0) available[li] -= 2;
        sumArr[li] -= 1;
      }
    } else if (owner === 1) {
      countB++;
      scoreB += 1;
      levelB += getStandardSpellStar(index);
      for (const li of cellToLines[index]) {
        if (available[li] % 2 === 0) available[li] -= 1;
        sumArr[li] += 1;
      }
    }
  });
  //计算是否产生了新的四连
  let gamePointFlag = false;
  const fullLine = board.size;
  const nearLine = fullLine - 1;
  for (let i = 0; i < lineCount; i++) {
    if (sumArr[i] === -fullLine) {
      winFlag.value = -(i + 1);
      break;
    } else if (sumArr[i] === fullLine) {
      winFlag.value = i + 1;
      break;
    } else if (
      (sumArr[i] === -nearLine && oldSumArr.value[i] > -nearLine && isPlayerB.value) ||
      (sumArr[i] === nearLine && oldSumArr.value[i] < nearLine && isPlayerA.value)
    ) {
      gamePointFlag = true;
    }
  }
  if (gamePointFlag && !gameStore.isReplayMode) {
    layoutRef.value?.warnGamePoint();
  }
  oldSumArr.value = sumArr;

  playerAScore.value = scoreA;
  playerBScore.value = scoreB;
  playerALevel.value = levelA;
  playerBLevel.value = levelB;

  if (winFlag.value === 0) {
    if (countA > board.area / 2) {
      winFlag.value = -13;
    } else if (countB > board.area / 2) {
      winFlag.value = 13;
    } else {
      winFlag.value = getStandardTieBreakWinner(cells, countA, countB, levelA, levelB);
    }
  }

  if (winFlag.value === 0 && gameStore.leftTime < 0 && countA !== countB) {
    winFlag.value = countA > countB ? -14 : 14;
  }

  if (gameStore.isReplayMode) return;
  if (!roomData.value.host) {
    if (winFlag.value !== 0) {
      if (roomSettings.value.noWinningDeclaration) {
        layoutRef.value?.hideAlert();
      } else {
        layoutRef.value?.showAlert("已满足胜利条件，等待A队队长判断胜负", "red");
      }
    } else {
      layoutRef.value?.hideAlert();
    }
  } else if (!isHost.value) {
    if (winFlag.value !== 0) {
      layoutRef.value?.showAlert("已满足胜利条件，等待房主判断胜负", "red");
    } else {
      layoutRef.value?.hideAlert();
    }
  }
};

//BP赛
const isMyTurn = computed(
  () =>
    (isPlayerA.value && gameStore.bpGameData.whose_turn === 0) ||
    (isPlayerB.value && gameStore.bpGameData.whose_turn === 1)
);
const bingoBpPhase = computed(() => gameStore.bpGameData.ban_pick !== 2);
//总失败次数
const playerAFailure = ref(0);
const playerBFailure = ref(0);

const nextRound = () => {
  gameStore.bpGameNextRound();
};
const confirmBp = () => {
  if (selectedSpellIndex.value === -1) return;
  gameStore.bpGameBanPick(selectedSpellIndex.value).then(() => {
    gameModeSelectedSpellIndex.value = -1;
  });
};
const decideBp = (status) => {
  const board = boardSpec.value;
  const lines = board.winningLines();
  const lineCount = lines.length;
  const available: number[] = new Array(lineCount).fill(2);
  const sumArr: number[] = new Array(lineCount).fill(0);
  winFlag.value = 0;
  let count = 0;
  let scoreA = 0;
  let scoreB = 0;
  const cellToLines: number[][] = Array.from({ length: board.area }, () => []);
  lines.forEach((line, li) => {
    line.forEach((idx) => cellToLines[idx].push(li));
  });
  status.forEach((item: number, index: number) => {
    if (item == -1) {
      count++;
    }
    if (item === 5) {
      count++;
      scoreA += gameStore.spells[index].star;
      for (const li of cellToLines[index]) {
        if (available[li] > 0) available[li] -= 2;
        sumArr[li] -= 1;
      }
    } else if (item === 7) {
      count++;
      scoreB += gameStore.spells[index].star;
      for (const li of cellToLines[index]) {
        if (available[li] % 2 === 0) available[li] -= 1;
        sumArr[li] += 1;
      }
    }
  });

  const fullLine = board.size;
  for (let i = 0; i < lineCount; i++) {
    if (sumArr[i] === -fullLine) {
      winFlag.value = -(i + 1);
      break;
    } else if (sumArr[i] === fullLine) {
      winFlag.value = i + 1;
      break;
    }
  }

  let playerAFailureNew = 0;
  let playerBFailureNew = 0;
  gameStore.bpGameData.spell_failed_count_a.forEach((item: number) => {
    playerAFailureNew += item;
  });
  gameStore.bpGameData.spell_failed_count_b.forEach((item: number) => {
    playerBFailureNew += item;
  });

  //加分的一方收卡音效
  if ((playerAScore.value < scoreA && isPlayerA.value) || (playerBScore.value < scoreB && isPlayerB.value)) {
    layoutRef.value?.infoCaptureCard();
  }
  playerAScore.value = scoreA;
  playerBScore.value = scoreB;

  //失败的一方爆点音效
  if (
    (playerAFailure.value < playerAFailureNew && isPlayerA.value) ||
    (playerBFailure.value < playerBFailureNew && isPlayerB.value)
  ) {
    layoutRef.value?.infoFailCard();
  }
  playerAFailure.value = playerAFailureNew;
  playerBFailure.value = playerBFailureNew;

  if (count == board.area) {
    if (scoreB - scoreA < 0) {
      winFlag.value = -25;
    } else {
      winFlag.value = 25;
    }
  }

  if (!isHost.value) {
    if (winFlag.value !== 0) {
      layoutRef.value?.showAlert("已满足胜利条件，等待房主判断胜负", "red");
    } else {
      layoutRef.value?.hideAlert();
    }
  }
};

// link赛
const linkData = computed(() => gameStore.linkGameData);
const linkPhase = computed(() => {
  if (!inGame.value) return 0;
  if (linkData.value.event_a === 1 || linkData.value.event_b === 1) return 2;
  if (linkData.value.event_a === 3 && linkData.value.event_b === 3) return 3;
  if (linkData.value.route_confirmed_a || linkData.value.route_confirmed_b || routeA.value.length > 1 || routeB.value.length > 1) {
    return 1;
  }
  return 1;
});
const routeA = computed(() => linkData.value.link_idx_a?.length ? linkData.value.link_idx_a : [0]);
const routeB = computed(() =>
  linkData.value.link_idx_b?.length ? linkData.value.link_idx_b : [boardSpec.value.size - 1]
);
const linkRouteLevelA = computed(() => routeA.value.reduce((sum, idx) => sum + (gameStore.spells[idx]?.star || 0), 0));
const linkRouteLevelB = computed(() => routeB.value.reduce((sum, idx) => sum + (gameStore.spells[idx]?.star || 0), 0));
const linkLevelCoefficient = computed(() => roomStore.roomConfig.link_level_coefficient ?? 2);
const linkRouteScoreA = computed(() => Math.round(linkRouteLevelA.value * linkLevelCoefficient.value * 10) / 10);
const linkRouteScoreB = computed(() => Math.round(linkRouteLevelB.value * linkLevelCoefficient.value * 10) / 10);
const linkFastestEnabled = computed(() => Config.spellListWithTimer.includes(roomStore.roomConfig.spell_version));
const linkRouteFastest = (route: number[]) => {
  if (!linkFastestEnabled.value) return 0;
  const total = route.reduce((sum, idx) => sum + (gameStore.spells[idx]?.fastest || 0), 0);
  return Math.round(total * 10) / 10;
};
const linkRouteFastestA = computed(() => linkRouteFastest(routeA.value));
const linkRouteFastestB = computed(() => linkRouteFastest(routeB.value));
const linkEndA = computed(() => roomStore.roomConfig.link_end_a ?? boardSpec.value.area - 1);
const linkEndB = computed(() => roomStore.roomConfig.link_end_b ?? boardSpec.value.index(boardSpec.value.size - 1, 0));
const myLinkRoute = computed(() => {
  const idx = myEffectivePlayerIndex.value;
  if (idx !== null) return linkRouteForPlayer(idx);
  return isPlayerA.value ? routeA.value : routeB.value;
});
const myLinkRouteConfirmed = computed(() => {
  const idx = myEffectivePlayerIndex.value;
  if (idx !== null) return linkConfirmedForPlayer(idx);
  return isPlayerA.value ? linkData.value.route_confirmed_a : linkData.value.route_confirmed_b;
});
const controlledLinkPlayer = computed<0 | 1 | null>(() => {
  const takeover = takeoverPlayerIndex.value;
  if (takeover >= 0 && isOwner.value) return takeover as 0 | 1;
  if (isHost.value) return null;
  if (isPlayerA.value) return 0;
  if (isPlayerB.value) return 1;
  return null;
});
const myEffectivePlayerIndex = computed<0 | 1 | null>(() => {
  const takeover = takeoverPlayerIndex.value;
  if (takeover >= 0 && isOwner.value) return takeover as 0 | 1;
  if (isPlayerA.value) return 0;
  if (isPlayerB.value) return 1;
  return null;
});
const linkRouteForPlayer = (playerIndex: 0 | 1) => (playerIndex === 0 ? routeA.value : routeB.value);
const linkConfirmedForPlayer = (playerIndex: 0 | 1) =>
  playerIndex === 0 ? linkData.value.route_confirmed_a : linkData.value.route_confirmed_b;
const linkEndForPlayer = (playerIndex: 0 | 1) => (playerIndex === 0 ? linkEndA.value : linkEndB.value);
const linkRouteCompleteForPlayer = (playerIndex: 0 | 1) => {
  const route = linkRouteForPlayer(playerIndex);
  return route.length > 0 && route[route.length - 1] === linkEndForPlayer(playerIndex);
};
const linkRouteComplete = computed(() => {
  const idx = myEffectivePlayerIndex.value ?? (isPlayerA.value ? 0 : 1);
  const route = linkRouteForPlayer(idx);
  const end = linkEndForPlayer(idx);
  return route.length > 0 && route[route.length - 1] === end;
});
const bothLinkRoutesConfirmed = computed(() => linkData.value.route_confirmed_a && linkData.value.route_confirmed_b);
const myLinkFinished = computed(() => (isPlayerA.value ? linkData.value.event_a === 3 : linkData.value.event_b === 3));
const myLinkCurrentStep = computed(() => (isPlayerA.value ? linkData.value.current_step_a : linkData.value.current_step_b));
const myLinkLastGetTime = computed(() => (isPlayerA.value ? linkData.value.last_get_time_a : linkData.value.last_get_time_b));
const myLinkSkipUsed = computed(() => (isPlayerA.value ? linkData.value.skip_used_a : linkData.value.skip_used_b));
const linkSkipLimit = (route: number[]) => route.length > 10 ? 2 : 1;
const linkSkipRemainA = computed(() => Math.max(0, linkSkipLimit(routeA.value) - (linkData.value.skip_used_a || 0)));
const linkSkipRemainB = computed(() => Math.max(0, linkSkipLimit(routeB.value) - (linkData.value.skip_used_b || 0)));
const canManageLinkA = computed(() => isBingoLink.value && (isHost.value || (!roomData.value.host && isPlayerA.value)));
const canManageLinkB = computed(() => isBingoLink.value && (isHost.value || (!roomData.value.host && isPlayerB.value)));
// Use ref+watch instead of computed to avoid Vue computed caching issues with reactive object properties
const takeoverPlayerIndex = ref(gameStore.linkGameData.takeover_player_index ?? -1);
const takeoverUiKey = ref(0);
watch(
  () => [
    gameStore.linkGameData.takeover_player_index,
    gameStore.linkGameData.route_confirmed_a,
    gameStore.linkGameData.route_confirmed_b,
  ],
  ([takeover, confirmedA, confirmedB]) => {
    takeoverPlayerIndex.value = takeover ?? -1;
    takeoverUiKey.value++;
  }
);
const isTakeoverActive = computed(() => takeoverPlayerIndex.value >= 0);
const canTakeover = computed(() => isBingoLink.value && linkPhase.value === 1 && isOwner.value);
const canTakeoverPlayerA = computed(() => canTakeover.value && takeoverPlayerIndex.value !== 0);
const canTakeoverPlayerB = computed(() => canTakeover.value && takeoverPlayerIndex.value !== 1);
const isMyRouteLocked = computed(() => {
  if (!isTakeoverActive.value) return false;
  if (isHost.value || isWatcher.value) return false;
  const myIdx = isPlayerA.value ? 0 : 1;
  return takeoverPlayerIndex.value === myIdx;
});
const linkPlayerFinished = (playerIndex: 0 | 1) => playerIndex === 0 ? linkData.value.event_a === 3 : linkData.value.event_b === 3;
const linkCurrentStepForPlayer = (playerIndex: 0 | 1) => playerIndex === 0 ? linkData.value.current_step_a || 0 : linkData.value.current_step_b || 0;
const linkCurrentIndexForPlayer = (playerIndex: 0 | 1) => linkRouteForPlayer(playerIndex)[linkCurrentStepForPlayer(playerIndex)] ?? -1;
const linkCurrentSelectedForPlayer = (playerIndex: 0 | 1) => {
  const idx = linkCurrentIndexForPlayer(playerIndex);
  if (idx < 0) return false;
  const status = playerIndex === 0 ? linkData.value.status_a?.[idx] : linkData.value.status_b?.[idx];
  return status === (playerIndex === 0 ? 1 : 3);
};
const myLinkCurrentIndex = computed(() => controlledLinkPlayer.value == null ? -1 : linkCurrentIndexForPlayer(controlledLinkPlayer.value));
const myLinkCurrentSelected = computed(() => controlledLinkPlayer.value != null && linkCurrentSelectedForPlayer(controlledLinkPlayer.value));
const linkNow = ref(Date.now());
const getLinkNow = () => gameStore.isReplayMode ? replayInstance.getReplayWallTime() : Date.now();
const linkCooldown = computed(() => {
  if (linkPhase.value !== 2) return -1;
  const cd = isPlayerA.value ? roomStore.actualCdTimeA : roomStore.actualCdTimeB;
  return Math.max(0, myLinkLastGetTime.value + cd - linkNow.value);
});
const canLinkSkip = computed(() => {
  if (controlledLinkPlayer.value == null) return false;
  return canLinkSkipForPlayer(controlledLinkPlayer.value);
});
const linkSkipUsedForPlayer = (playerIndex: 0 | 1) =>
  playerIndex === 0 ? linkData.value.skip_used_a || 0 : linkData.value.skip_used_b || 0;
const linkSkipWaitLeftForPlayer = (playerIndex: 0 | 1) => {
  const route = linkRouteForPlayer(playerIndex);
  const step = linkCurrentStepForPlayer(playerIndex);
  if (step >= route.length) return 0;
  const spell = gameStore.spells[route[step]];
  if (!spell) return 0;
  const lastGet = playerIndex === 0 ? linkData.value.last_get_time_a : linkData.value.last_get_time_b;
  return Math.max(0, lastGet + linkCdForPlayer(playerIndex) + 45_000 - linkNow.value);
};
const linkSkipButtonText = computed(() => {
  if (controlledLinkPlayer.value == null) return "跳过";
  const playerIndex = controlledLinkPlayer.value;
  const route = linkRouteForPlayer(playerIndex);
  if (linkSkipUsedForPlayer(playerIndex) >= linkSkipLimit(route)) return "无跳过次数";
  const cdLeft = linkCdLeftForPlayer(playerIndex);
  if (cdLeft > 0) return `CD ${Math.ceil(cdLeft / 1000)}秒`;
  const waitLeft = linkSkipWaitLeftForPlayer(playerIndex);
  if (waitLeft > 0) return `${Math.ceil(waitLeft / 1000)}秒后可跳过`;
  return "跳过";
});
const canLinkSkipForPlayer = (playerIndex: 0 | 1) => {
  const route = linkRouteForPlayer(playerIndex);
  const step = linkCurrentStepForPlayer(playerIndex);
  if (step >= route.length) return false;
  if (linkCdLeftForPlayer(playerIndex) > 0) return false;
  if (linkSkipUsedForPlayer(playerIndex) >= linkSkipLimit(route)) return false;
  return linkSkipWaitLeftForPlayer(playerIndex) <= 0;
};

const linkCdForPlayer = (playerIndex: 0 | 1) => playerIndex === 0 ? roomStore.actualCdTimeA : roomStore.actualCdTimeB;
const linkActiveUsedMs = (playerIndex: 0 | 1, step: number, event: number, start: number, end: number, now: number) => {
  if (start <= 0) return 0;
  const stop = event === 3 && end > 0 ? end : now;
  const elapsed = Math.max(0, stop - start);
  const cd = Math.max(0, linkCdForPlayer(playerIndex));
  const completedCd = Math.max(0, step - 1) * cd;
  const lastGet = playerIndex === 0 ? linkData.value.last_get_time_a : linkData.value.last_get_time_b;
  const currentCd = event === 3 || step <= 0 || lastGet <= 0 ? 0 : Math.min(cd, Math.max(0, stop - lastGet));
  return Math.max(0, elapsed - completedCd - currentCd);
};
const linkEffectiveUsedMsA = computed(() =>
  linkActiveUsedMs(
    0,
    linkData.value.current_step_a || 0,
    linkData.value.event_a,
    linkData.value.start_ms_a,
    linkData.value.end_ms_a,
    linkNow.value
  )
);
const linkEffectiveUsedMsB = computed(() =>
  linkActiveUsedMs(
    1,
    linkData.value.current_step_b || 0,
    linkData.value.event_b,
    linkData.value.start_ms_b,
    linkData.value.end_ms_b,
    linkNow.value
  )
);
const linkCdLeftForPlayer = (playerIndex: 0 | 1) => {
  const data = linkData.value;
  const event = playerIndex === 0 ? data.event_a : data.event_b;
  if (event !== 1) return 0;
  const step = playerIndex === 0 ? data.current_step_a || 0 : data.current_step_b || 0;
  if (step <= 0) return 0;
  const lastGet = playerIndex === 0 ? data.last_get_time_a : data.last_get_time_b;
  if (lastGet <= 0) return 0;
  return Math.max(0, lastGet + linkCdForPlayer(playerIndex) - linkNow.value);
};
const linkCdLeftA = computed(() => linkCdLeftForPlayer(0));
const linkCdLeftB = computed(() => linkCdLeftForPlayer(1));
const formatLinkDuration = (milliseconds: number) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const decideLink = () => {
  const now = getLinkNow();
  const liveScore = (playerIndex: 0 | 1) => {
    const route = playerIndex === 0 ? routeA.value : routeB.value;
    const step = playerIndex === 0 ? linkData.value.current_step_a || 0 : linkData.value.current_step_b || 0;
    const start = playerIndex === 0 ? linkData.value.start_ms_a : linkData.value.start_ms_b;
    const end = playerIndex === 0 ? linkData.value.end_ms_a : linkData.value.end_ms_b;
    const event = playerIndex === 0 ? linkData.value.event_a : linkData.value.event_b;
    const skipped = new Set(playerIndex === 0 ? linkData.value.skipped_idx_a || [] : linkData.value.skipped_idx_b || []);
    const taken = route.slice(0, step).filter((idx) => !skipped.has(idx));
    const level = taken.reduce((sum, idx) => sum + (gameStore.spells[idx]?.star || 0), 0);
    const fastest = taken.reduce((sum, idx) => sum + (gameStore.spells[idx]?.fastest || 0), 0);
    const usedMs = linkActiveUsedMs(playerIndex, step, event, start, end, now);
    return (
      boardSpec.value.size * 200 +
      level * (roomStore.roomConfig.link_level_coefficient ?? 2) +
      fastest * (roomStore.roomConfig.link_fastest_coefficient ?? 1) -
      usedMs / 1000
    );
  };
  playerAScore.value = Math.round(liveScore(0) * 10) / 10;
  playerBScore.value = Math.round(liveScore(1) * 10) / 10;
  const skippedA = new Set(linkData.value.skipped_idx_a || []);
  const skippedB = new Set(linkData.value.skipped_idx_b || []);
  playerALevel.value = routeA.value.slice(0, linkData.value.current_step_a || 0).reduce((sum, idx) => {
    if (skippedA.has(idx)) return sum;
    return sum + (gameStore.spells[idx]?.star || 0);
  }, 0);
  playerBLevel.value = routeB.value.slice(0, linkData.value.current_step_b || 0).reduce((sum, idx) => {
    if (skippedB.has(idx)) return sum;
    return sum + (gameStore.spells[idx]?.star || 0);
  }, 0);
  if (linkData.value.event_a === 3 && linkData.value.event_b === 3) {
    winFlag.value = (linkData.value.score_a || 0) >= (linkData.value.score_b || 0) ? -30 : 30;
    if (!isOwner.value) layoutRef.value?.showAlert("双方已完成，等待确认胜负", "red");
  } else if (inGame.value && isBingoLink.value) {
    winFlag.value = 0;
  }
};

const confirmLinkRoute = () => {
  gameStore.linkConfirmRoute(!myLinkRouteConfirmed.value);
};
const linkUndo = () => {
  gameStore.linkUndo();
};
const startLinkRun = () => {
  countdownRef.value?.stop();
  gameStore.gameStatus = GameStatus.STARTED;
  gameStore.linkSetPhase(2);
};
const linkNextCard = () => {
  gameStore.linkNextCard();
};
const linkFinishCard = () => {
  gameStore.linkFinishCard();
};
const linkSkipCard = () => {
  if (!canLinkSkip.value) return;
  gameStore.linkSkipCard();
};
const forceLinkSkip = (playerIndex: 0 | 1) => {
  if (linkCdLeftForPlayer(playerIndex) > 0 || linkPlayerFinished(playerIndex)) return;
  gameStore.linkForceSkip(playerIndex);
};
const undoLinkFinish = (playerIndex: 0 | 1) => {
  gameStore.linkUndoFinish(playerIndex);
};
const setLinkSkipUsed = (playerIndex: 0 | 1, value: number) => {
  gameStore.linkSetSkipUsed(playerIndex, value);
};
const setLinkSkipRemain = (playerIndex: 0 | 1, remain: number) => {
  const route = playerIndex === 0 ? routeA.value : routeB.value;
  const limit = linkSkipLimit(route);
  gameStore.linkSetSkipUsed(playerIndex, Math.max(0, Math.min(limit, limit - remain)));
};
const linkAiSpeedrun = () => {
  gameStore.linkAiSpeedrun();
};
const takeoverRoute = (playerIndex: number) => {
  gameStore.linkTakeoverRoute(playerIndex);
};
const releaseTakeover = () => {
  gameStore.linkReleaseTakeover();
};

const lastLinkStepA = ref(0);
const lastLinkStepB = ref(0);
const linkStepSoundInited = ref(false);
const resetLocalGameState = () => {
  countdownRef.value?.pause();
  gameModeSelectedSpellIndex.value = -1;
  winFlag.value = 0;
  playerAScore.value = 0;
  playerBScore.value = 0;
  playerAFailure.value = 0;
  playerBFailure.value = 0;
  playerALevel.value = 0;
  playerBLevel.value = 0;
  lastLinkStepA.value = 0;
  lastLinkStepB.value = 0;
  linkStepSoundInited.value = false;
  linkNow.value = getLinkNow();
};
watch(
  () => gameStore.linkGameData,
  () => {
    if (isBingoLink.value) decideLink();
    const stepA = gameStore.linkGameData.current_step_a || 0;
    const stepB = gameStore.linkGameData.current_step_b || 0;
    if (linkStepSoundInited.value && ((isPlayerA.value && stepA > lastLinkStepA.value) || (isPlayerB.value && stepB > lastLinkStepB.value))) {
      layoutRef.value?.infoCaptureCard();
    }
    lastLinkStepA.value = stepA;
    lastLinkStepB.value = stepB;
    linkStepSoundInited.value = true;
  },
  { deep: true, immediate: true }
);

const linkLiveTimer = ref<number | null>(null);
watch(
  () => [isBingoLink.value, linkPhase.value],
  ([isLink, phase]) => {
    if (linkLiveTimer.value) {
      clearInterval(linkLiveTimer.value);
      linkLiveTimer.value = null;
    }
    if (isLink && phase === 2) {
      linkLiveTimer.value = window.setInterval(() => {
        linkNow.value = getLinkNow();
        decideLink();
      }, 1000);
    }
  },
  { immediate: true }
);

watch(
  () => gameStore.gameStatus,
  (newVal, oldVal) => {
    switch (newVal) {
      case GameStatus.NOT_STARTED:
        resetLocalGameState();
        break;
      case GameStatus.COUNT_DOWN:
        nextTick(() => {
          countdownRef.value?.start();
        });
        break;
      case GameStatus.STARTED:
        if (!isBingoBp.value) {
          nextTick(() => {
            countdownRef.value?.start();
          });
        }
        break;
      case GameStatus.PAUSED:
        break;
      case GameStatus.ENDED:
        layoutRef.value?.showAlert("比赛已结束，等待房主操作", "red");
        // ElMessageBox.alert(`${roomData.value.last_winner}获胜`, "比赛结束", {
        //   confirmButtonText: "确定",
        // });
        // roomStore.roomData.change_card_count = [0, 0];
        break;
    }
  },
  {
    immediate: true,
  }
);

watch(
  [
    () => gameStore.cells,
    () => gameStore.cells2,
    () => gameStore.currentBoard,
    () => gameStore.spells,
    () => gameStore.spells2,
  ],
  ([cells, cells2]) => {
    if (isBingoStandard.value && cells && cells.length) {
      decideStandard(isDualBoard.value && gameStore.currentBoard === 1 && cells2?.length ? cells2 : cells);
    }
  },
  { deep: true, immediate: true }
);

//方法
const startGame = () => {
  if (roomSettings.value.gamebp && !roomStore.practiceMode && (!roomSettings.value.matchbp || !inMatch.value)) {
    startBP();
  } else {
    roomStore.applyCustomCardPoolSelection();
    gameStore.startGame({
      ...roomStore.getStartGameCustomPoolData(),
      change_card_base_a: roomSettings.value.playerA.changeCardCount,
      change_card_base_b: roomSettings.value.playerB.changeCardCount,
    }).then(() => {
      if (isBingoLink.value) gameStore.linkSetPhase(1);
      if (isBingoLink.value) {
        countdownRef.value?.stop();
        gameStore.gameStatus = GameStatus.COUNT_DOWN;
        gameStore.leftTime = roomConfig.value.countdown * 1000;
        nextTick(() => countdownRef.value?.start());
      }
      layoutRef.value?.hideAlert();
    });
  }
};
const drawSpellCard = () => {
  roomStore.applyCustomCardPoolSelection();
  gameStore.startGame({
    ...roomStore.getStartGameCustomPoolData(),
    change_card_base_a: roomSettings.value.playerA.changeCardCount,
    change_card_base_b: roomSettings.value.playerB.changeCardCount,
  }).then(() => {
    layoutRef.value?.hideAlert();
  });
};
const stopGame = () => {
  const checked = ref<1 | 0 | -1>(-1);
  ElMessageBox({
    title: "还没有人获胜，现在结束比赛请选择一个选项",
    message: () =>
      h(
        ElRadioGroup,
        {
          modelValue: checked.value,
          "onUpdate:modelValue": (val: any) => {
            checked.value = val;
          },
        },
        () => [
          h(
            ElRadio,
            {
              value: -1,
            },
            {
              default: () => "结果作废",
            }
          ),
          h(
            ElRadio,
            {
              value: 0,
            },
            {
              default: () => teamLabel(0) + "获胜",
            }
          ),
          h(
            ElRadio,
            {
              value: 1,
            },
            {
              default: () => teamLabel(1) + "获胜",
            }
          ),
        ]
      ),
  })
    .then(() => {
      //winner
      if ((checked.value as number) < 0) {
        gameStore.stopGame(-1);
      } else {
        gameStore.stopGame(checked.value);
      }
    })
    .catch(() => {});
};
const pauseGame = () => {
  gameStore.pause(true);
};
const resumeGame = () => {
  gameStore.pause(false);
};
const confirmWinner = () => {
  gameStore.stopGame(winFlag.value < 0 ? 0 : 1).then(() => {
    countdownRef.value?.stop();
    winFlag.value = 0;
  });
};
/*
const stopGameInfo = (winner: number) => {
  if (isPlayerA.value) {
    winner == 0 ? layoutRef.value?.infoWinGame() : layoutRef.value?.infoLoseGame();
  }
  if (isPlayerB.value) {
    winner == 1 ? layoutRef.value?.infoWinGame() : layoutRef.value?.infoLoseGame();
  }
};*/
const playerAWin = ref(0);
const playerBWin = ref(0);
watch(
  () => roomData.value.score,
  (score) => {
    if (score[0] > playerAWin.value) {
      if (isPlayerA.value) layoutRef.value?.infoWinGame();
      if (isPlayerB.value) layoutRef.value?.infoLoseGame();
    }
    if (score[1] > playerBWin.value) {
      if (isPlayerB.value) layoutRef.value?.infoWinGame();
      if (isPlayerA.value) layoutRef.value?.infoLoseGame();
    }
    playerAWin.value = score[0];
    playerBWin.value = score[1];
  },
  { deep: true, immediate: true }
);
const confirmSelect = () => {
  gameStore.alreadySelectCard = true;
  gameStore.selectSpell(selectedSpellIndex.value, gameStore.currentBoard).then(() => {
    gameModeSelectedSpellIndex.value = -1;
  });
};
const confirmAttained = () => {
  gameStore.finishSpell(gameStore.mySelectedIndex);
};
const warnTargetA = ref("");
const warnTargetB = ref("");
watch(
  () => roomStore.roomData.teams,
  () => {
    if (warnTargetA.value && !teamMembers(0).some((m) => m.name === warnTargetA.value)) warnTargetA.value = "";
    if (warnTargetB.value && !teamMembers(1).some((m) => m.name === warnTargetB.value)) warnTargetB.value = "";
  },
  { deep: true }
);
const warnPlayer = (name) => {
  if (!name) return;
  // 服务端错误（如对方离线）由 WebSocket 层统一用 ElMessage 提示
  return ws.send(WebSocketActionType.GM_WARN_PLAYER, { name }).catch(() => {});
};
const onCountDownComplete = () => {
  if (isBingoLink.value) {
    if (linkPhase.value === 1) {
      gameStore.gameStatus = GameStatus.STARTED;
      if (isOwner.value) {
        gameStore.linkSetPhase(2);
      }
    }
    return;
  }
  if (gameStore.gameStatus === GameStatus.COUNT_DOWN) {
    gameStore.gameStatus = GameStatus.STARTED;
    gameStore.leftTime = roomConfig.value.game_time * 1000 * 60;
    if (!isBingoBp.value) {
      nextTick(() => {
        countdownRef.value?.start();
      });
    }
  } else if (gameStore.gameStatus === GameStatus.STARTED) {
    gameStore.gameStatus = GameStatus.ENDED;
    if (!roomData.value.host) {
      layoutRef.value?.showAlert("游戏时间到，等待A队队长判断胜负", "red");
    } else if (!isHost.value) {
      layoutRef.value?.showAlert("游戏时间到，等待房主判断胜负", "red");
    } else {
      layoutRef.value?.showAlert("游戏时间到，请判断胜负", "red");
    }
  }
};
const resetRoom = () => {
  ElMessageBox.confirm("该操作会把房间恢复到初始状态，是否确认？", "警告", {
    confirmButtonText: "确认",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      roomStore.resetRoom();
    })
    .catch(() => {});
};
const addChangeCardCount = (team: number) => {
  roomStore.updateChangeCardCount(team, roomData.value.change_card_count[team] + 1);
};
const removeChangeCardCount = (team: number) => {
  roomStore.updateChangeCardCount(team, Math.max(0, roomData.value.change_card_count[team] - 1));
};

const switchDualBoardSide = () => {
  // 盘面视图是纯客户端状态，切换不发请求
  gameStore.currentBoard = 1 - gameStore.currentBoard;
};

// Auto-switch functionality for dual boards
const autoSwitchTimer = ref<number | null>(null);
const autoSwitchLeftTime = ref(0);

// Start auto-switch timer
const startAutoSwitchTimer = () => {
  if (autoSwitchTimer.value) return;

  // Reset left time to interval value
  autoSwitchLeftTime.value = roomSettings.value.autoSwitchInterval;

  autoSwitchTimer.value = setInterval(() => {
    autoSwitchLeftTime.value--;

    if (autoSwitchLeftTime.value <= 0) {
      // Perform auto-switch
      switchDualBoardSide();
      autoSwitchLeftTime.value = roomSettings.value.autoSwitchInterval;
    }
  }, 1000);
};

// Stop auto-switch timer
const stopAutoSwitchTimer = () => {
  if (autoSwitchTimer.value) {
    clearInterval(autoSwitchTimer.value);
    autoSwitchTimer.value = null;
  }
  autoSwitchLeftTime.value = 0;
};

// Reset auto-switch timer
const resetAutoSwitchTimer = () => {
  stopAutoSwitchTimer();
  if (shouldAutoSwitch.value) {
    startAutoSwitchTimer();
  }
};

// Check if auto-switch conditions are met
const shouldAutoSwitch = computed(() => {
  return (
    roomSettings.value.autoSwitchInDualMode && !isPlayer.value && roomStore.roomConfig.dual_board > 0 && inGame.value
  );
});

// Watch for changes to autoSwitchInDualMode
watch(
  () => roomSettings.value.autoSwitchInDualMode,
  (newValue) => {
    if (newValue) {
      if (shouldAutoSwitch.value) {
        startAutoSwitchTimer();
      }
    } else {
      stopAutoSwitchTimer();
    }
  }
);

// Watch for changes to autoSwitchInterval
watch(
  () => roomSettings.value.autoSwitchInterval,
  (newInterval) => {
    if (autoSwitchTimer.value) {
      // Reset left time to the minimum of new interval and current left time
      autoSwitchLeftTime.value = Math.min(newInterval, autoSwitchLeftTime.value);
    }
  }
);

// Watch for inGame changes
watch(
  () => inGame.value,
  (newValue) => {
    if (newValue && shouldAutoSwitch.value) {
      startAutoSwitchTimer();
    } else {
      stopAutoSwitchTimer();
    }
  }
);

// Watch for manual board switches
watch(
  () => gameStore.currentBoard,
  () => {
    // Reset timer only if it's a manual switch (not caused by auto-switch)
    if (autoSwitchTimer.value) {
      resetAutoSwitchTimer();
    }
  }
);

// Start timer when component mounts
onMounted(() => {
  if (shouldAutoSwitch.value) {
    startAutoSwitchTimer();
  }
});

// Clean up timer on component unmount
onUnmounted(() => {
  stopAutoSwitchTimer();
  if (linkLiveTimer.value) {
    clearInterval(linkLiveTimer.value);
    linkLiveTimer.value = null;
  }
});

const replaySpeed = ref(1);
const speedValues = [1, 1.5, 2, 3, 5, 8, 15, 30];
const speedMarks = {
  1: "1",
  2: "1.5",
  3: "2",
  4: "3",
  5: "5",
  6: "8",
  7: "15",
  8: "30",
};
watch(
  () => gameStore.isReplayMode,
  (isReplayActive) => {
    if (isReplayActive) {
      // 当新的回放开始时，将 UI 滑块的位置重置为 1
      replaySpeed.value = 1;
    }
  }
);
// 切换回放播放/暂停
const toggleReplay = () => {
  if (replayInstance.state.isReplayFinished) {
    return; // 如果已经结束，不做任何事
  }
  layoutRef.value?.hideAlert();
  if (replayInstance.state.isPlaying) {
    replayInstance.pauseReplay();
  } else {
    replayInstance.resumeReplay();
  }
};
// 改变回放速度
const changeReplaySpeed = (value: number) => {
  const newSpeed = speedValues[value - 1];
  if (newSpeed) {
    replayInstance.setSpeed(newSpeed);
  } else {
    console.error(`Invalid slider value received: ${value}`);
  }
};

// 格式化回放时间显示
const formatReplayTime = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

// 确认退出回放(保持不变)
const confirmExitReplay = () => {
  replayInstance.endReplay();
};

onUnmounted(() => {
  if (gameStore.isReplayMode) {
    replayInstance.endReplay();
  }
});

const handleTimelineChange = (value: number) => {
  replayInstance.jumpToTime(value);
  layoutRef.value?.hideAlert();
};

const jumpToPreviousReplayAction = () => {
  replayInstance.jumpToPreviousAction();
  layoutRef.value?.hideAlert();
};

const jumpToNextReplayAction = () => {
  replayInstance.jumpToNextAction();
  layoutRef.value?.hideAlert();
};

const handleEditorCellClick = (index: number) => {
  // Delegate the logic entirely to the store
  editorStore.selectSpell(index);
};

// 计算属性，用于向模态框传递数据
const selectedSpellData = computed(() => {
  if (!editorStore.isEditorMode || editorStore.selectedSpellIndex === -1) {
    return { spell: {}, status: 0, isPortal: false };
  }
  const index = editorStore.selectedSpellIndex;
  const board = gameStore.currentBoard;
  const spell = board === 0 ? editorStore.spells[index] : editorStore.spells2[index];
  const status = editorStore.spellStatus[index];
  const portals = board === 0 ? editorStore.normalGameData.is_portal_a : editorStore.normalGameData.is_portal_b;
  const isPortal = (roomStore.roomConfig.dual_board > 0 && portals && portals[index] === 1) || false;
  return { spell, status, isPortal };
});

// 处理模态框确认事件
const handleEditorConfirm = (payload) => {
  const index = editorStore.selectedSpellIndex;
  editorStore.updateSpell({ index, spellData: payload.spellData });
  editorStore.updateSpellStatus({ index, status: payload.status });
  editorStore.updatePortalStatus({ index, isPortal: payload.isPortal });
  editorStore.closeModal();
};

// 处理模态框清空事件
const handleEditorClear = () => {
  editorStore.clearSpell(editorStore.selectedSpellIndex);
  editorStore.closeModal();
};

// --- 键盘快捷键---
const handleKeyDown = (e: KeyboardEvent) => {
  if (!editorStore.isEditorMode || editorStore.selectedSpellIndex === -1) return;

  // 检查是否在输入框内，避免冲突
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  if (e.ctrlKey || e.metaKey) {
    // metaKey for macOS
    if (e.key === "c") {
      e.preventDefault();
      editorStore.copySpell(editorStore.selectedSpellIndex);
    } else if (e.key === "v") {
      e.preventDefault();
      editorStore.pasteSpell(editorStore.selectedSpellIndex);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      editorStore.clearSpell(editorStore.selectedSpellIndex);
    }
  }
};

onMounted(() => {
  document.addEventListener("keydown", handleKeyDown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeyDown);
});

const handleClearAll = () => {
  ElMessageBox.confirm("确定要清空所有格子的内容吗？此操作不可恢复。", "警告", {
    type: "warning",
    confirmButtonText: "确认清空",
    confirmButtonClass: "el-button--danger",
  })
    .then(() => {
      editorStore.clearAllSpells();
      ElMessage.success("已清空");
    })
    .catch(() => {});
};

const handleShuffleSpells = () => {
  ElMessageBox.confirm("确定要洗混当前盘面的格子吗？此操作不可恢复。", "提示", {
    type: "warning",
    confirmButtonText: "确认洗混",
    cancelButtonText: "取消",
  })
    .then(() => {
      const result = editorStore.shuffleSpells();
      if (result.success) {
        ElMessage.success(result.message);
      }
    })
    .catch(() => {});
};

</script>

<style lang="scss" scoped>
.warn-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-top: 10px;

  .warn-select {
    width: 96px;
  }
}

.change-pending {
  margin-top: 4px;
  font-size: 12px;
  color: #e6a23c;
}

.no-opponent-side {
  margin-top: 20px;
  font-size: 16px;
  color: #909399;
}

.change-card-button {
  margin-left: 10px;
}

.change-pending-tip {
  font-size: 12px;
  opacity: 0.75;
}

.force-ban-ex-content {
  p {
    margin: 0 0 8px;
    line-height: 1.6;
  }

  .force-ban-ex-waiting {
    color: #e6a23c;
    margin-bottom: 0;
  }
}
.link-board-summary {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  width: 126px;
  box-sizing: border-box;
  margin-top: 4px;
  padding: 5px 6px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.88);
  font-size: 12px;
  line-height: 1.35;
  text-align: center;
}
.link-board-summary span {
  white-space: normal;
}
.page-icon {
  width: 20px;
  height: 20px;
  border: 1px solid #000;
  background-color: var(--bg-color);
  cursor: pointer;
}
.page-icon-reverse {
  width: 20px;
  height: 20px;
  border: 1px solid #000;
  background-color: var(--bg-color-reverse);
  cursor: pointer;
}
.page {
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--board-overlay-width, calc(100% - 8px));
  height: var(--board-overlay-height, calc(100% - 8px));
  transform: translate(-50%, -50%);
  pointer-events: none;
  background: linear-gradient(90deg, transparent 95%, var(--bg-color)),
    linear-gradient(180deg, transparent 95%, var(--bg-color)), linear-gradient(270deg, transparent 95%, var(--bg-color)),
    linear-gradient(360deg, transparent 95%, var(--bg-color));
}
.page-reverse {
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--board-overlay-width, calc(100% - 8px));
  height: var(--board-overlay-height, calc(100% - 8px));
  transform: translate(-50%, -50%);
  pointer-events: none;
  background: linear-gradient(90deg, transparent 95%, var(--bg-color-reverse)),
    linear-gradient(180deg, transparent 95%, var(--bg-color-reverse)),
    linear-gradient(270deg, transparent 95%, var(--bg-color-reverse)),
    linear-gradient(360deg, transparent 95%, var(--bg-color-reverse));
}
.replay-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}
.replay-time {
  font-size: 14px;
  min-width: 100px;
  text-align: center;
}
.button-right-2 {
  align-items: first;
}
</style>
