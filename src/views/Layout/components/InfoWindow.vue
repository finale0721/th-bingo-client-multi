<template>
  <div class="info-window">
    <div class="info">
      <el-tabs v-model="tabIndex" class="info-tabs">
        <el-tab-pane label="用户/房间" :name="0" class="tab-content">
          <el-scrollbar>
            <div class="user-info">
              <el-form label-width="90px">
                <el-form-item label="用户名：">
                  <div class="label-with-button">
                    <div class="userName">
                      <span>{{ localStore.username }}</span>
                    </div>
                  </div>
                </el-form-item>
              </el-form>
              <div class="info-button">
                <el-button type="primary" @click="logout" :disabled="inGame">退出登录</el-button>
              </div>
            </div>
            <el-divider style="margin: 10px 0"></el-divider>
            <div class="room-info" v-if="inRoom">
              <el-form label-width="90px">
                <el-form-item label="房间密码：">
                  <div class="label-with-button">
                    <span>******</span>
                    <el-button link type="primary" @click="copyPassword">复制</el-button>
                  </div>
                </el-form-item>
                <el-form-item label="房间规则：">
                  {{ roomTypeText }}
                </el-form-item>
                <el-form-item label="房间模式：">{{ roomData.host ? "导播模式" : "无导播模式" }}</el-form-item>
                <el-form-item v-if="roomData.host" label="导播：">{{ roomData.host }}</el-form-item>
                <el-form-item label="左侧玩家：">{{ roomData.names[0] }}</el-form-item>
                <el-form-item label="右侧玩家：">{{ roomData.names[1] }}</el-form-item>
                <el-form-item label="观众：" v-if="roomData.watchers.length">
                  <div>
                    <div v-for="(item, index) in roomData.watchers" :key="index">{{ item }}</div>
                  </div>
                </el-form-item>
              </el-form>
              <div class="info-button">
                <template v-if="!isHost">
                  <el-button
                    v-if="isWatcher"
                    type="primary"
                    @click="sitDown"
                    :disabled="inGame || (roomData.names[0] !== '' && roomData.names[1] !== '')"
                  >成为玩家</el-button
                  >
                  <el-button v-if="isPlayer" type="primary" @click="standUp" :disabled="inGame || isReplayMode || editorStore.isEditorMode">成为观众</el-button>
                </template>
                <el-button type="primary" @click="leaveRoom" :disabled="inGame && !isWatcher">退出房间</el-button>

                <el-button
                  type="primary"
                  @click="downloadGameLog"
                  :disabled="isLogButtonDisabled || (inGame && !isHost) || !inRoom || editorStore.isEditorMode || isReplayMode"
                  style="margin-top: 10px;"
                >
                  下载上局记录
                </el-button>

                <el-button
                    :disabled="!inRoom || inGame || isWatcher || editorStore.isEditorMode || isReplayMode"
                    type="primary"
                    @click="showReplayDialog"
                    style="margin-top: 10px;"
                >
                  回放对局
                </el-button>

                <el-button
                  :disabled="!inRoom || inGame || isWatcher || isReplayMode"
                  type="primary"
                  @click="editorStore.toggleEditorMode()"
                  style="margin-top: 10px;"
                >
                  {{ editorStore.isEditorMode ? '退出编辑器' : '盘面编辑器' }}
                </el-button>

              </div>
            </div>

            <div class="doc-button-container">
              <el-button class="doc-button" @click="showDoc = true" circle>
                <el-icon><QuestionFilled /></el-icon>
              </el-button>
            </div>

          </el-scrollbar>
        </el-tab-pane>
        <el-tab-pane label="房间设置" :name="1" class="tab-content">
          <el-scrollbar>
            <template v-if="inRoom">
              <el-collapse v-model="activeCollapseNames">
                <!-- 基本设置 -->
                <el-collapse-item title="基本设置" name="basic" v-if="(!soloMode && isHost) || (soloMode && isPlayerA)">
                  <el-form label-width="90px">
                    <el-form-item label="规则：">
                      <div class="label-with-button">
                        <div>
                          <el-select v-if="showTypeInput" v-model="roomSettings.type" style="width: 150px">
                            <el-option
                              v-for="(item, index) in gameTypeList"
                              :key="index"
                              :label="item.name"
                              :value="item.type"
                              :disabled="item.type === BingoType.BP && roomSettings.board_size !== 5"
                            ></el-option>
                          </el-select>
                          <span v-else> {{ roomTypeText }}</span>
                        </div>
                        <el-button link type="primary" @click="editType" v-if="!inGame">{{
                            showTypeInput ? "确认" : "修改"
                          }}</el-button>
                      </div>
                    </el-form-item>
                    <el-form-item label="盘面大小：">
                      <el-radio-group
                        v-model="roomSettings.board_size"
                        :disabled="inGame"
                        @change="onBoardSizeChange"
                      >
                        <el-radio :value="4" :disabled="roomSettings.type === BingoType.BP">4×4</el-radio>
                        <el-radio :value="5">5×5</el-radio>
                        <el-radio :value="6" :disabled="roomSettings.type === BingoType.BP">6×6</el-radio>
                      </el-radio-group>
                    </el-form-item>
                    <el-form-item label="比赛时长：">
                      <el-input-number
                        class="input-number"
                        v-model="currentGameTime"
                        :min="10"
                        :max="180"
                        :disabled="inGame"
                        size="small"
                        controls-position="right"
                        @change="roomStore.updateRoomConfig('game_time')"
                      />
                      <span class="input-number-text">分钟</span>
                    </el-form-item>
                    <el-form-item label="倒计时：">
                      <el-input-number
                        class="input-number"
                        v-model="currentCountdown"
                        :min="0"
                        :disabled="inGame"
                        size="small"
                        controls-position="right"
                        @change="roomStore.updateRoomConfig('countdown')"
                      />
                      <span class="input-number-text">秒</span>
                    </el-form-item>
                    <el-form-item label="选卡CD：">
                      <el-input-number
                        class="input-number"
                        v-model="roomSettings.cdTime"
                        :min="1"
                        :max="999"
                        :disabled="inGame"
                        size="small"
                        controls-position="right"
                        @change="roomStore.updateRoomConfig('cd_time')"
                      />
                      <span class="input-number-text">秒</span>
                    </el-form-item>
                    <el-form-item label="赛制：">
                      <span style="margin-right: 5px">BO</span>
                      <el-input-number
                        class="input-number"
                        v-model="roomSettings.format"
                        :min="1"
                        :max="9"
                        :step="2"
                        :disabled="inMatch"
                        size="small"
                        controls-position="right"
                        @change="onFormatChange"
                      />
                    </el-form-item>
                    <el-form-item label="隐藏阈值：" v-if="roomSettings.type === BingoType.STANDARD">
                      <span style="margin-right: 5px">左侧</span>
                      <el-input-number
                        class="input-number"
                        v-model="currentHiddenThresholdA"
                        :min="1"
                        :max="roomSettings.board_size * roomSettings.board_size"
                        :disabled="inGame"
                        size="small"
                        controls-position="right"
                        @change="roomStore.updateRoomConfig('hidden_select_threshold_a')"
                      />
                      <span class="input-number-text">张</span>
                    </el-form-item>
                    <el-form-item label="隐藏阈值：" v-if="roomSettings.type === BingoType.STANDARD">
                      <span style="margin-right: 5px">右侧</span>
                      <el-input-number
                        class="input-number"
                        v-model="currentHiddenThresholdB"
                        :min="1"
                        :max="roomSettings.board_size * roomSettings.board_size"
                        :disabled="inGame"
                        size="small"
                        controls-position="right"
                        @change="roomStore.updateRoomConfig('hidden_select_threshold_b')"
                      />
                      <span class="input-number-text">张</span>
                    </el-form-item>
                    <el-form-item label="CD修正：" v-if="roomSettings.type !== BingoType.LINK">
                      <span style="margin-right: 5px">左侧</span>
                      <el-input-number
                        class="input-number"
                        v-model="roomSettings.cdModifierA"
                        :min="-roomSettings.cdTime+1"
                        :max="roomSettings.cdTime*2"
                        :disabled="inGame"
                        size="small"
                        controls-position="right"
                        @change="roomStore.updateRoomConfig('cd_modifier_a')"
                      />
                      <span class="input-number-text">秒</span>
                    </el-form-item>
                    <el-form-item label="CD修正：" v-if="roomSettings.type !== BingoType.LINK">
                      <span style="margin-right: 5px">右侧</span>
                      <el-input-number
                        class="input-number"
                        v-model="roomSettings.cdModifierB"
                        :min="-roomSettings.cdTime+1"
                        :max="roomSettings.cdTime*2"
                        :disabled="inGame"
                        size="small"
                        controls-position="right"
                        @change="roomStore.updateRoomConfig('cd_modifier_b')"
                      />
                      <span class="input-number-text">秒</span>
                    </el-form-item>
                  </el-form>
                </el-collapse-item>

                <!-- 玩法设置 -->
                <el-collapse-item title="玩法设置" name="gameplay" v-if="(!soloMode && isHost) || (soloMode && isPlayerA)">
                  <el-form label-width="90px">
                    <el-form-item label="卡池设定：">
                      <el-radio-group
                        v-model="cardPoolMode"
                        :disabled="inGame"
                        size="small"
                        style="margin-right: 8px"
                      >
                        <el-radio-button label="system">系统</el-radio-button>
                        <el-radio-button label="custom">自定义</el-radio-button>
                      </el-radio-group>
                      <el-select
                          v-if="!roomSettings.custom_card_pool_enabled"
                          v-model="roomSettings.spell_version"
                          style="width: 120px"
                          @change="roomStore.updateRoomConfig()"
                          :disabled="inGame"
                      >
                        <el-option
                            v-for="(item, index) in Config.spellVersionList"
                            :key="index"
                            :label="item.name"
                            :value="item.type"
                        ></el-option>
                      </el-select>
                      <template v-else>
                        <el-radio-group
                          v-model="customPoolSource"
                          size="small"
                          :disabled="inGame"
                          style="margin-right: 8px"
                        >
                          <el-radio-button label="local">本地</el-radio-button>
                          <el-radio-button label="online">在线</el-radio-button>
                        </el-radio-group>
                        <template v-if="customPoolSource === 'local'">
                          <el-select
                            v-model="customCardPoolSelectedId"
                            style="width: 160px"
                            placeholder="选择卡池"
                            clearable
                            :disabled="inGame"
                            @change="onCustomCardPoolChange"
                          >
                            <el-option
                              v-for="slot in customCardPoolOptions"
                              :key="slot.id"
                              :label="customCardPoolTitle(slot)"
                              :value="slot.id"
                            />
                          </el-select>
                          <el-button size="small" :disabled="inGame" @click="customCardPoolDialogVisible = true">
                            管理
                          </el-button>
                        </template>
                        <template v-else>
                          <el-button size="small" :disabled="inGame" @click="onlinePoolDialogVisible = true">
                            管理
                          </el-button>
                          <span v-if="onlineCustomPoolStore.selectedPool" style="margin-left: 8px; font-size: 13px; color: #67c23a;">
                            已选：{{ onlineCustomPoolStore.selectedPool.file_name }}
                          </span>
                          <span v-else style="margin-left: 8px; font-size: 13px; color: #909399;">
                            未选择在线卡池
                          </span>
                        </template>
                      </template>
                    </el-form-item>
                    <el-form-item label="AI练习：" v-if="aiPracticeVisible">
                      <el-checkbox
                          v-model="roomSettings.use_ai"
                          :disabled="aiPracticeDisabled || customCardPoolActive"
                          @change="roomStore.updateRoomConfig()"
                          style="margin-right: 0"
                      ></el-checkbox>
                    </el-form-item>
                    <el-form-item label="AI策略：" v-if="roomSettings.use_ai && roomSettings.type !== BingoType.LINK">
                      <el-select
                          v-model="roomSettings.ai_strategy_level"
                          style="width: 120px"
                          @change="roomStore.updateRoomConfig('ai_strategy_level')"
                          :disabled="inGame"
                      >
                        <el-option
                            v-for="(item, index) in aiStrategyLevelList"
                            :key="index"
                            :label="item.name"
                            :value="item.type"
                        ></el-option>
                      </el-select>
                    </el-form-item>
                    <!--
                    <el-form-item label="AI风格：" v-if="roomSettings.use_ai && roomSettings.ai_strategy_level >= 3">
                      <el-select
                        v-model="roomSettings.ai_style"
                        style="width: 120px"
                        @change="roomStore.updateRoomConfig('ai_style')"
                        :disabled="inGame"
                      >
                        <el-option
                          v-for="(item, index) in aiStyleLevelList"
                          :key="index"
                          :label="item.name"
                          :value="item.type"
                        ></el-option>
                      </el-select>
                    </el-form-item>
                    -->
                    <el-form-item label="AI底力：" v-if="roomSettings.use_ai">
                      <div style="display: flex; align-items: center; width: 100%;">
                        <el-slider
                          v-model="roomSettings.ai_base_power"
                          :min="0"
                          :max="10"
                          :step="0.1"
                          :disabled="inGame"
                          @change="roomStore.updateRoomConfig('ai_base_power')"
                          style="flex-grow: 1; margin-right: 15px;"
                        />
                        <el-input-number
                          v-model="roomSettings.ai_base_power"
                          :min="0"
                          :max="10"
                          :step="0.1"
                          :disabled="inGame"
                          size="small"
                          controls-position="right"
                          @change="roomStore.updateRoomConfig('ai_base_power')"
                          style="width: 130px;"
                        />
                      </div>
                    </el-form-item>
                    <el-form-item label="AI熟练度：" v-if="roomSettings.use_ai">
                      <div style="display: flex; align-items: center; width: 100%;">
                        <el-slider
                          v-model="roomSettings.ai_experience"
                          :min="0"
                          :max="10"
                          :step="0.1"
                          :disabled="inGame"
                          @change="roomStore.updateRoomConfig('ai_experience')"
                          style="flex-grow: 1; margin-right: 15px;"
                        />
                        <el-input-number
                          v-model="roomSettings.ai_experience"
                          :min="0"
                          :max="10"
                          :step="0.1"
                          :disabled="inGame"
                          size="small"
                          controls-position="right"
                          @change="roomStore.updateRoomConfig('ai_experience')"
                          style="width: 130px;"
                        />
                      </div>
                    </el-form-item>
                    <el-form-item label="选卡温度：" v-if="roomSettings.use_ai && roomSettings.type !== BingoType.LINK && roomSettings.ai_strategy_level >= 3">
                      <div style="display: flex; align-items: center; width: 100%;">
                        <el-slider
                          v-model="roomSettings.ai_temperature"
                          :min="0"
                          :max="2"
                          :step="0.05"
                          :disabled="inGame"
                          @change="roomStore.updateRoomConfig('ai_temperature')"
                          style="flex-grow: 1; margin-right: 15px;"
                        />
                        <el-input-number
                          v-model="roomSettings.ai_temperature"
                          :min="0"
                          :max="2"
                          :step="0.05"
                          :disabled="inGame"
                          size="small"
                          controls-position="right"
                          @change="roomStore.updateRoomConfig('ai_temperature')"
                          style="width: 130px;"
                        />
                      </div>
                    </el-form-item>
                    <el-form-item label="AI相性：" v-if="roomSettings.use_ai">
                      <el-button
                          type="primary"
                          @click="showAIPreferenceBalancer"
                          size="small"
                      >
                        设置相性
                      </el-button>
                    </el-form-item>
                    <el-form-item label="盲盒设定：" v-if="roomSettings.type !== BingoType.LINK">
                      <el-select
                          v-model="roomSettings.blind_setting"
                          style="width: 120px"
                          @change="roomStore.updateRoomConfig()"
                          :disabled="inGame"
                      >
                        <el-option
                            v-for="(item, index) in blindTypeList"
                            :key="index"
                            :label="item.name"
                            :value="item.type"
                        ></el-option>
                      </el-select>
                    </el-form-item>
                    <el-form-item label="揭示等级" v-if="roomSettings.type !== BingoType.LINK && roomSettings.blind_setting > 1 &&
                      !(roomSettings.type == BingoType.BP && roomSettings.blind_setting == 3)">
                      <el-input-number
                          class="input-number"
                          v-model="roomSettings.blind_reveal_level"
                          :min="0"
                          :max="4"
                          :step="1"
                          :disabled="inGame"
                          size="small"
                          controls-position="right"
                          @change="roomStore.updateRoomConfig('blind_reveal_level')"
                      />
                      <span class="input-number-text"></span>
                    </el-form-item>
                    <el-form-item label="双重盘面：" v-if="roomSettings.type == BingoType.STANDARD">
                      <el-select
                          v-model="roomSettings.dual_board"
                          style="width: 120px"
                          @change="roomStore.updateRoomConfig()"
                          :disabled="inGame"
                      >
                        <el-option
                            v-for="(item, index) in dualTypeList"
                            :key="index"
                            :label="item.name"
                            :value="item.type"
                        ></el-option>
                      </el-select>
                    </el-form-item>
                    <el-form-item label="转换格数：" v-if="roomSettings.dual_board > 0 && roomSettings.type == BingoType.STANDARD">
                      <el-input-number
                          class="input-number"
                          v-model="currentPortalCount"
                          :min="1"
                          :max="roomSettings.board_size * roomSettings.board_size"
                          :step="1"
                          :disabled="inGame"
                          size="small"
                          controls-position="right"
                          @change="roomStore.updateRoomConfig('portal_count')"
                      />
                      <span class="input-number-text">格</span>
                    </el-form-item>
                    <el-form-item label="差异等级：" v-if="roomSettings.dual_board > 0 && roomSettings.type == BingoType.STANDARD">
                      <el-input-number
                          class="input-number"
                          v-model="roomSettings.diff_level"
                          :min="-1"
                          :max="5"
                          :step="1"
                          :disabled="inGame"
                          size="small"
                          controls-position="right"
                          @change="roomStore.updateRoomConfig('diff_level')"
                      />
                      <span class="input-number-text"></span>
                    </el-form-item>
                    <el-form-item label="额外连线：" v-if="roomSettings.board_size === 6 && roomSettings.type == BingoType.STANDARD">
                      <el-input-number
                          class="input-number"
                          v-model="roomSettings.extra_line_count"
                          :min="0"
                          :max="4"
                          :step="1"
                          :disabled="inGame"
                          size="small"
                          controls-position="right"
                          @change="onExtraLineCountChange"
                      />
                      <span class="input-number-text">条</span>
                    </el-form-item>
                    <template v-if="roomSettings.type == BingoType.LINK">
                      <el-form-item label="连接规则：">
                        <el-radio-group
                          v-model="roomSettings.link_connectivity"
                          :disabled="inGame"
                          @change="roomStore.updateRoomConfig('link_connectivity')"
                        >
                          <el-radio :value="4">四向</el-radio>
                          <el-radio :value="8">八向</el-radio>
                        </el-radio-group>
                      </el-form-item>
                      <el-form-item label="等级系数：">
                        <el-input-number
                          class="input-number"
                          v-model="roomSettings.link_level_coefficient"
                          :min="0"
                          :max="30"
                          :step="0.5"
                          :disabled="inGame"
                          size="small"
                          controls-position="right"
                          @change="roomStore.updateRoomConfig('link_level_coefficient')"
                        />
                      </el-form-item>
                      <el-form-item label="时长系数：">
                        <el-input-number
                          class="input-number"
                          v-model="roomSettings.link_fastest_coefficient"
                          :min="0"
                          :max="1"
                          :step="0.05"
                          :disabled="inGame"
                          size="small"
                          controls-position="right"
                          @change="roomStore.updateRoomConfig('link_fastest_coefficient')"
                        />
                      </el-form-item>
                      <el-form-item label="特殊格：">
                        <el-button size="small" :disabled="inGame" @click="openLinkBoardSettings">设置起终点/禁用格</el-button>
                      </el-form-item>
                    </template>
                  </el-form>
                </el-collapse-item>
            
            <!-- 作品设置 -->
            <el-collapse-item title="作品设置" name="game" v-if="(!soloMode && isHost) || (soloMode && isPlayerA)">
              <el-form label-width="90px">
                <el-form-item label="作品BP：">
                  <el-checkbox
                      v-model="roomSettings.gamebp"
                      :disabled="inMatch || customCardPoolActive || roomStore.practiceMode"
                      @change="saveRoomSettings"
                      style="margin-right: 0"
                  ></el-checkbox>
                </el-form-item>
                <!--
                <el-form-item label="全局BP：" v-if="roomSettings.gamebp">
                  <el-checkbox
                      v-model="roomSettings.matchbp"
                      :disabled="inGame"
                      @change="saveRoomSettings"
                      style="margin-right: 0"
                  ></el-checkbox>
                </el-form-item>
                -->
                <el-form-item label="题目：" v-if="!roomSettings.gamebp">
                  <el-checkbox-group
                      v-model="roomSettings.checkList"
                      style="text-align: left"
                      :min="1"
                      @change="roomStore.updateRoomConfig('games')"
                  >
                    <el-checkbox v-for="(item, index) in activeGameList" :value="item.code" :key="index" :disabled="inGame">{{
                        item.name
                      }}</el-checkbox>
                  </el-checkbox-group>
                </el-form-item>
                <el-form-item label="符卡来源：" v-if="!roomSettings.gamebp">
                  <el-checkbox-group
                      v-model="roomSettings.rankList"
                      style="text-align: left"
                      :min="1"
                      @change="roomStore.updateRoomConfig('ranks')"
                  >
                    <el-checkbox v-for="(item, index) in rankList" :value="item" :key="index" :disabled="inGame">{{ item }}</el-checkbox>
                  </el-checkbox-group>
                </el-form-item>
                <el-form-item label="生成权重：">
                  <el-button
                      :type="isWeightModified ? 'success' : 'primary'"
                      @click="showWeightBalancer"
                      :disabled="activeGameList.length <= 1 || inGame"
                      size="small"
                  >
                    设置权重
                  </el-button>
                </el-form-item>
                <el-form-item label="保作保底：" v-if="roomSettings.type === BingoType.BP || roomSettings.gamebp">
                  <el-input-number
                      class="input-number"
                      v-model="roomSettings.pick_guarantee_count"
                      :min="0"
                      :max="Math.floor(roomSettings.board_size * roomSettings.board_size * 20 / 100)"
                      :step="1"
                      :disabled="inGame"
                      size="small"
                      controls-position="right"
                      @change="roomStore.updateRoomConfig('pick_guarantee_count')"
                  />
                  <span class="input-number-text">张</span>
                </el-form-item>
                <el-form-item label="bingo难度：">
                  <el-radio-group
                    v-model="roomSettings.difficulty"
                    style="text-align: left"
                    :disabled="inGame"
                    @change="roomStore.updateRoomConfig('difficulty')"
                  >
                    <el-radio
                      v-for="(item, index) in difficultyList"
                      :value="item.value"
                      :key="index"
                      :disabled="roomSettings.type === BingoType.LINK && item.value > 3"
                    >{{
                        item.name
                      }}</el-radio>
                  </el-radio-group>
                  <el-button
                    v-if="roomSettings.difficulty === 6"
                    @click="showCustomLevelBalancer"
                    size="small"
                    style="margin-left: 10px;"
                    :type="customDifficultyButtonType"
                    :disabled="inGame"
                  >
                    自定义
                  </el-button>
                </el-form-item>
              </el-form>
            </el-collapse-item>

            <!-- 左侧玩家设置 -->
            <el-collapse-item title="左侧玩家设置" name="playerA" >
              <el-form label-width="90px">
                <el-form-item label="颜色：">
                <el-color-picker
                  v-model="roomSettings.playerA.color"
                  size="small"
                  color-format="hsl"
                  show-alpha
                  :predefine="predefineColors"
                  @change="(newColor) => saveRoomSettings"
                />
              </el-form-item>
              <template v-if="isHost">
                <el-form-item label="延迟时间：" v-if="roomData.type !== 2">
                  <el-input-number
                    class="input-number"
                    v-model="roomSettings.playerA.delay"
                    :min="0"
                    size="small"
                    :step="0.1"
                    controls-position="right"
                    @change="saveRoomSettings"
                  />
                  <span class="input-number-text">秒</span>
                </el-form-item>
                <el-form-item label="换卡次数：" v-if="roomData.type === 1">
                  <el-input-number
                    class="input-number"
                    v-model="roomSettings.playerA.changeCardCount"
                    :min="0"
                    size="small"
                    controls-position="right"
                    @change="saveRoomSettings"
                  />
                  <span class="input-number-text">次</span>
                </el-form-item>
              </template>
            </el-form>
          </el-collapse-item>

          <!-- 右侧玩家设置 -->
          <el-collapse-item title="右侧玩家设置" name="playerB">
            <el-form label-width="90px">
              <el-form-item label="颜色：">
                <el-color-picker
                  v-model="roomSettings.playerB.color"
                  size="small"
                  color-format="hsl"
                  show-alpha
                  :predefine="predefineColors"
                  @change="(newColor) => saveRoomSettings"
                />
              </el-form-item>
              <template v-if="isHost">
                <el-form-item label="延迟时间：" v-if="roomData.type !== 2">
                  <el-input-number
                    class="input-number"
                    v-model="roomSettings.playerB.delay"
                    :min="0"
                    size="small"
                    :step="0.1"
                    controls-position="right"
                    @change="saveRoomSettings"
                  />
                  <span class="input-number-text">秒</span>
                </el-form-item>
                <el-form-item label="换卡次数：" v-if="roomData.type === 1">
                  <el-input-number
                    class="input-number"
                    v-model="roomSettings.playerB.changeCardCount"
                    :min="0"
                    size="small"
                    controls-position="right"
                    @change="saveRoomSettings"
                  />
                  <span class="input-number-text">次</span>
                </el-form-item>
              </template>
            </el-form>
          </el-collapse-item>

          <!-- 通用设置 -->
          <el-collapse-item title="通用设置" name="general">
            <el-form label-width="90px">
              <el-form-item label="BGM静音：">
                <el-checkbox v-model="roomSettings.bgmMuted" @change="saveRoomSettings"></el-checkbox>
              </el-form-item>
              <el-form-item label="音效静音：">
                <el-checkbox v-model="roomSettings.sfxMuted" @change="saveRoomSettings"></el-checkbox>
              </el-form-item>
              <el-form-item label="收取延时：">
                <el-input-number
                  class="input-number"
                  v-model="roomSettings.confirmDelay"
                  :min="0"
                  size="small"
                  controls-position="right"
                  @change="saveRoomSettings"
                />
                <span class="input-number-text">秒</span>
              </el-form-item>
              <el-form-item label="额外连线：">
                <el-color-picker
                  v-model="roomSettings.extraLineColor"
                  size="small"
                  color-format="hex"
                  :predefine="predefineExtraLineColors"
                  @change="saveRoomSettings"
                />
              </el-form-item>
              <el-form-item label="link路线：">
                <el-color-picker
                  v-model="roomSettings.linkPathColorA"
                  size="small"
                  color-format="hex"
                  :predefine="predefineExtraLineColors"
                  @change="saveRoomSettings"
                />
                <el-color-picker
                  v-model="roomSettings.linkPathColorB"
                  size="small"
                  color-format="hex"
                  :predefine="predefineExtraLineColors"
                  @change="saveRoomSettings"
                />
              </el-form-item>
              <el-form-item label="盘面背景：" v-if="roomStore.roomConfig.dual_board > 0 && roomSettings.type !== BingoType.LINK">
                <el-color-picker
                  v-model="roomSettings.backgroundColor"
                  size="small"
                  color-format="hsl"
                  show-alpha
                  :predefine="predefineColors"
                  @change="(newColor) => saveRoomSettings"
                />
                <el-color-picker
                  v-model="roomSettings.backgroundColorReverse"
                  size="small"
                  color-format="hsl"
                  show-alpha
                  :predefine="predefineColors"
                  @change="(newColor) => saveRoomSettings"
                />
              </el-form-item>
              <el-form-item label="自动翻面：">
                <el-checkbox v-model="roomSettings.autoSwitchInDualMode" @change="saveRoomSettings" :disabled="isPlayer"></el-checkbox>
              </el-form-item>
              <el-form-item label="翻面间隔：" :disabled="isPlayer">
                <el-input-number
                  class="input-number"
                  v-model="roomSettings.autoSwitchInterval"
                  :min="3"
                  :max="40"
                  size="small"
                  :step="1"
                  controls-position="right"
                  @change="saveRoomSettings"
                />
                <span class="input-number-text">秒</span>
              </el-form-item>
              <el-form-item label="练习不结束">
                <el-checkbox v-model="roomSettings.noWinningDeclaration" @change="saveRoomSettings" :disabled="inGame"></el-checkbox>
              </el-form-item>
            </el-form>
          </el-collapse-item>
        </el-collapse>
      </template>
          </el-scrollbar>
        </el-tab-pane>
        <el-tab-pane label="操作记录" :name="2" class="tab-content">
          <el-scrollbar ref="scrollbar">
            <div class="log-list">
              <div class="log-list-item" v-for="(log, index) in gameLogs" :key="index" v-html="log"></div>
            </div>
          </el-scrollbar>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog v-model="replayDialogVisible" title="输入对局代码" width="500px">
      <el-input
          v-model="replayCode"
          type="textarea"
          placeholder="请粘贴对局代码"
          :rows="6"
      ></el-input>
      <template #footer>
        <el-button @click="replayDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="startReplay">开始回放</el-button>
      </template>
    </el-dialog>

    <!-- 游戏权重均衡器对话框 -->
    <GameWeightBalancer
        v-model:visible="weightBalancerVisible"
        :game-list="weightBalancerGameList"
        :current-weights="roomSettings.game_weight"
        @confirm="handleWeightConfirm"
    />

    <!-- AI偏好设置对话框 -->
    <AIPreferenceBalancer
        v-model:visible="aiPreferenceVisible"
        :game-list="activeGameList"
        :current-preferences="roomSettings.ai_preference"
        @confirm="handleAIPreferenceConfirm"
    />

    <CustomLevelBalancer
      v-model:visible="customLevelBalancerVisible"
      :current-counts="currentCustomLevelCount"
      :board-area="roomSettings.board_size * roomSettings.board_size"
      :default-counts="roomStore.defaultCustomCountsForBoard(currentBoardSize)"
      @confirm="handleCustomLevelConfirm"
    />

    <CustomCardPoolDialog
      v-model:visible="customCardPoolDialogVisible"
      @selected="roomStore.updateRoomConfig()"
    />

    <OnlinePoolBrowserDialog
      v-model:visible="onlinePoolDialogVisible"
      @selected="onOnlinePoolSelected"
    />

    <el-dialog v-model="linkBoardDialogVisible" title="Link 赛特殊格设置" width="640px" class="link-board-dialog">
      <div class="link-board-config">
        <div
          class="link-board-grid"
          :style="{ gridTemplateColumns: `repeat(${currentBoardSize}, 1fr)` }"
        >
          <button
            v-for="cell in linkBoardCells"
            :key="cell.index"
            type="button"
            class="link-board-cell"
            :class="cell.class"
            :disabled="inGame"
            @click="handleLinkBoardCellClick(cell.index)"
          >
            <span class="link-board-cell-index">{{ cell.index + 1 }}</span>
            <span class="link-board-cell-labels">
              <span v-for="label in cell.labels" :key="label" class="link-board-cell-label">{{ label }}</span>
            </span>
          </button>
        </div>
        <div class="link-board-controls">
          <div class="link-board-panel-title">编辑模式</div>
          <el-radio-group v-model="linkBoardEditMode" size="small" class="link-board-mode-grid">
            <el-radio-button label="disabled">禁用格</el-radio-button>
            <el-radio-button label="startA">A 起点</el-radio-button>
            <el-radio-button label="endA">A 终点</el-radio-button>
            <el-radio-button label="startB">B 起点</el-radio-button>
            <el-radio-button label="endB">B 终点</el-radio-button>
          </el-radio-group>
          <div class="link-board-summary-panel">
            <div><span>A</span>{{ linkBoardDraft.startA + 1 }} -> {{ linkBoardDraft.endA + 1 }}</div>
            <div><span>B</span>{{ linkBoardDraft.startB + 1 }} -> {{ linkBoardDraft.endB + 1 }}</div>
            <div><span>禁</span>{{ linkBoardDraft.disabled.length }} 格</div>
          </div>
          <div class="link-board-hint">同一方起点和终点不能相同；双方允许共用起点或终点。禁用格不能覆盖任何起点或终点。</div>
        </div>
      </div>
      <template #footer>
        <el-button @click="cancelLinkBoardSettings">取消</el-button>
        <el-button @click="resetLinkBoardSettings">重置</el-button>
        <el-button type="primary" :disabled="inGame" @click="saveLinkBoardSettings">保存</el-button>
      </template>
    </el-dialog>

    <documentation :visible="showDoc" @close="showDoc = false" />
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch, nextTick } from "vue";
import {
  ElTabs,
  ElTabPane,
  ElDivider,
  ElForm,
  ElFormItem,
  ElButton,
  ElMessage,
  ElMessageBox,
  ElSelect,
  ElOption,
  ElCheckboxGroup,
  ElCheckbox,
  ElRadioGroup,
  ElRadio,
  ElRadioButton,
  ElInputNumber,
  ElColorPicker,
  ElScrollbar,
  ElDialog,
  ElInput,
  ElIcon,
  ElSlider,
  ElCollapse,
  ElCollapseItem,
  ElAlert,
} from "element-plus";
import Config from "@/config";
import { useRoomStore } from "@/store/RoomStore";
import { useLocalStore } from "@/store/LocalStore";
import { useGameStore } from "@/store/GameStore";
import { BingoType } from "@/types";
import Replay from "@/utils/Replay";
import GameWeightBalancer from '../../../components/GameWeightBalancer.vue'
import AIPreferenceBalancer from '../../../components/AIPreferenceBalancer.vue'
import CustomLevelBalancer from '../../../components/CustomLevelBalancer.vue'
import Documentation from '@/components/Documentation.vue';
import { QuestionFilled } from '@element-plus/icons-vue'
import { useEditorStore } from "@/store/EditorStore";
import PresetManager from "@/components/PresetManager.vue";
import CustomCardPoolDialog from "@/components/CustomCardPoolDialog.vue";
import OnlinePoolBrowserDialog from "@/components/OnlinePoolBrowserDialog.vue";
import { useCustomCardPoolStore } from "@/store/CustomCardPoolStore";
import { useOnlineCustomPoolStore } from "@/store/OnlineCustomPoolStore";

const roomStore = useRoomStore();
const localStore = useLocalStore();
const gameStore = useGameStore();
const editorStore = useEditorStore();
const customCardPoolStore = useCustomCardPoolStore();

const scrollbar = ref<InstanceType<typeof ElScrollbar>>();
const weightBalancerVisible = ref(false);
const aiPreferenceVisible = ref(false);
const customLevelBalancerVisible = ref(false);
const customCardPoolDialogVisible = ref(false);
const onlinePoolDialogVisible = ref(false);
const onlineCustomPoolStore = useOnlineCustomPoolStore();
const customPoolSource = ref<"local" | "online">("local");
const linkBoardDialogVisible = ref(false);
const linkBoardEditMode = ref<"disabled" | "startA" | "endA" | "startB" | "endB">("disabled");
const linkBoardDraft = ref({
  disabled: [] as number[],
  startA: 0,
  endA: 24,
  startB: 4,
  endB: 20,
});

const tabIndex = ref(0);
const showTypeInput = ref(false);
const gameList = computed( () => Config.gameOptionList(roomStore.roomConfig.spell_version));
const customCardPoolActive = computed(() => roomStore.customCardPoolActive);
const activeGameList = computed(() => {
  if (!customCardPoolActive.value) return gameList.value;
  if (customPoolSource.value === "online" && onlineCustomPoolStore.selectedGames.length > 0) {
    return onlineCustomPoolStore.selectedGames;
  }
  return customCardPoolStore.selectedGames;
});
const customCardPoolOptions = computed(() => customCardPoolStore.slots.filter((slot) => Boolean(slot)));
const customCardPoolSelectedId = computed<number | null>({
  get: () => customCardPoolStore.selectedId,
  set: (value) => customCardPoolStore.selectSlot(value),
});
const customCardPoolTitle = (slot: any) => slot.note || slot.fileName || `槽位 ${slot.id + 1}`;
const cardPoolMode = computed({
  get: () => roomSettings.value.custom_card_pool_enabled ? "custom" : "system",
  set: (value: string) => {
    roomStore.setCustomCardPoolEnabled(value === "custom");
    roomStore.updateRoomConfig();
  },
});
const rankList = Config.rankList;
const difficultyList = Config.difficultyList;
const predefineColors = Config.predefineColors;
const predefineExtraLineColors = ["#fbff00", "#2f80ff", "#ff4444", "#44cc44", "#ffffff", "#000000"];
const gameTypeList = computed(() => {
  if (soloMode.value) {
    return [...Config.gameTypeList]
  } else {
    return [...Config.gameTypeList]
  }
});
const roomSettings = computed(() => roomStore.roomSettings);
const roomData = computed(() => roomStore.roomData);
const currentBoardSize = computed(() => roomSettings.value.board_size || 5);
const useBoardSizeTimeSettings = computed(() =>
  roomSettings.value.type === BingoType.STANDARD || roomSettings.value.type === BingoType.LINK
);
const currentGameTime = computed({
  get: () => {
    if (roomSettings.value.type === BingoType.STANDARD) {
      return roomSettings.value.gameTimeByBoardSize[currentBoardSize.value];
    }
    if (roomSettings.value.type === BingoType.LINK) {
      return roomSettings.value.linkGameTimeByBoardSize[currentBoardSize.value];
    }
    return roomSettings.value.gameTimeLimit[roomSettings.value.type];
  },
  set: (value) => {
    if (roomSettings.value.type === BingoType.STANDARD) {
      roomSettings.value.gameTimeByBoardSize[currentBoardSize.value] = value;
    } else if (roomSettings.value.type === BingoType.LINK) {
      roomSettings.value.linkGameTimeByBoardSize[currentBoardSize.value] = value;
    } else {
      roomSettings.value.gameTimeLimit[roomSettings.value.type] = value;
    }
  },
});

const isBingoStandard = computed(() => roomStore.roomData.type === BingoType.STANDARD);
const isBingoBp = computed(() => roomStore.roomData.type === BingoType.BP);
const isBingoLink = computed(() => roomStore.roomData.type === BingoType.LINK);
const aiPracticeVisible = computed(() =>
  roomStore.practiceMode
  && Config.spellListWithTimer.includes(roomSettings.value.spell_version)
  && roomSettings.value.type !== BingoType.BP,
);
const aiPracticeDisabled = computed(() =>
  inGame.value
  || customCardPoolActive.value
  || roomSettings.value.dual_board > 0
  || (roomSettings.value.type === BingoType.STANDARD
    && (roomSettings.value.board_size !== 5 || roomSettings.value.blind_setting > 1)),
);

const currentCountdown = computed({
  get: () => {
    if (roomSettings.value.type === BingoType.STANDARD) {
      return roomSettings.value.countdownByBoardSize[currentBoardSize.value];
    }
    if (roomSettings.value.type === BingoType.LINK) {
      return roomSettings.value.linkCountdownByBoardSize[currentBoardSize.value];
    }
    return roomSettings.value.countdownTime[roomSettings.value.type];
  },
  set: (value) => {
    if (roomSettings.value.type === BingoType.STANDARD) {
      roomSettings.value.countdownByBoardSize[currentBoardSize.value] = value;
    } else if (roomSettings.value.type === BingoType.LINK) {
      roomSettings.value.linkCountdownByBoardSize[currentBoardSize.value] = value;
    } else {
      roomSettings.value.countdownTime[roomSettings.value.type] = value;
    }
  },
});
const currentPortalCount = computed({
  get: () => roomSettings.value.portalCountByBoardSize[currentBoardSize.value],
  set: (value) => {
    roomSettings.value.portalCountByBoardSize[currentBoardSize.value] = value;
  },
});
const currentHiddenThresholdA = computed({
  get: () => roomSettings.value.hiddenThresholdAByBoardSize[currentBoardSize.value],
  set: (value) => {
    roomSettings.value.hiddenThresholdAByBoardSize[currentBoardSize.value] = value;
  },
});
const currentHiddenThresholdB = computed({
  get: () => roomSettings.value.hiddenThresholdBByBoardSize[currentBoardSize.value],
  set: (value) => {
    roomSettings.value.hiddenThresholdBByBoardSize[currentBoardSize.value] = value;
  },
});
const currentCustomLevelCount = computed({
  get: () => roomSettings.value.customLevelCountByBoardSize[currentBoardSize.value] || roomStore.defaultCustomCountsForBoard(currentBoardSize.value),
  set: (value: number[]) => {
    roomSettings.value.customLevelCountByBoardSize[currentBoardSize.value] = value;
  },
});
const defaultLinkBoardSettings = () => {
  const size = currentBoardSize.value;
  const cached = roomStore.roomSettings.linkBoardSettingsByBoardSize?.[size];
  if (cached) {
    return {
      disabled: [...cached.disabled],
      startA: cached.startA,
      endA: cached.endA,
      startB: cached.startB,
      endB: cached.endB,
    };
  }
  return {
    disabled: [] as number[],
    startA: 0,
    endA: size * size - 1,
    startB: size - 1,
    endB: size * (size - 1),
  };
};
const linkEndpointSet = computed(
  () => new Set([linkBoardDraft.value.startA, linkBoardDraft.value.endA, linkBoardDraft.value.startB, linkBoardDraft.value.endB])
);
const linkBoardCells = computed(() => {
  const area = currentBoardSize.value * currentBoardSize.value;
  const disabled = new Set(linkBoardDraft.value.disabled);
  return Array.from({ length: area }, (_, index) => {
    const labels: string[] = [];
    if (index === linkBoardDraft.value.startA) labels.push("A起");
    if (index === linkBoardDraft.value.endA) labels.push("A终");
    if (index === linkBoardDraft.value.startB) labels.push("B起");
    if (index === linkBoardDraft.value.endB) labels.push("B终");
    if (disabled.has(index)) labels.push("禁");
    return {
      index,
      labels,
      class: {
        disabled: disabled.has(index),
        endpoint: linkEndpointSet.value.has(index),
      },
    };
  });
});
const gameLogs = computed(() => gameStore.gameLogs);
const inRoom = computed(() => roomStore.inRoom);
const isPlayer = computed(() => roomStore.isPlayer);
const isPlayerA = computed(() => roomStore.isPlayerA);
const isHost = computed(() => roomStore.isHost);
const isWatcher = computed(() => roomStore.isWatcher);
const soloMode = computed(() => roomStore.soloMode);
const inGame = computed(() => roomStore.inGame);
const inMatch = computed(() => roomStore.inMatch);

const roomTypeText = computed(() => {
  switch (roomData.value.type) {
    case 1:
      return "bingo 标准赛";
    case 2:
      return "bingo BP赛";
    case 3:
      return "bingo link赛";
    default:
      return "未选择比赛类型";
  }
});

const blindTypeList = [
  {
    name: "关闭",
    type: 1
  },
  {
    name: "模式1",
    type: 2
  },
  {
    name: "模式2",
    type: 3
  }
];

const dualTypeList = [
  {
    name: "关闭",
    type: 0
  },
  {
    name: "开启",
    type: 1
  }
]

const aiStrategyLevelList = [
  {
    name: "初级",
    type: 1
  },
  {
    name: "中级",
    type: 2
  },
  {
    name: "高级",
    type: 3
  },
]

const aiStyleLevelList = [
  {
    name: "平衡",
    type: 0
  },
  {
    name: "进攻",
    type: 1
  },
  {
    name: "防守",
    type: 2
  },
]

const logout = () => {
  localStore.logout();
};

const leaveRoom = () => {
  roomStore.leaveRoom();
};

const copyPassword = () => {
  navigator.clipboard
    .writeText(roomStore.roomId)
    .then(() => {
      ElMessage({
        message: "已复制密码到剪切板",
        type: "success",
      });
    })
    .catch(() => {
      ElMessage({
        message: "复制失败",
        type: "error",
      });
    });
};

const editType = () => {
  if (showTypeInput.value === false) {
    showTypeInput.value = true;
  } else {
    if (roomSettings.value.type === BingoType.LINK) {
      roomSettings.value.dual_board = 0;
      roomSettings.value.blind_setting = 1;
    }
    if (roomSettings.value.type === BingoType.BP) {
      roomSettings.value.board_size = 5;
      roomSettings.value.use_ai = false;
    }
    if (
      roomSettings.value.type === BingoType.STANDARD
      && roomSettings.value.board_size !== 5
      && roomSettings.value.use_ai
    ) {
      roomSettings.value.use_ai = false;
    }
    if (roomStore.roomConfig.type !== roomSettings.value.type) {
      roomStore.updateRoomConfig("type").then(() => {
        showTypeInput.value = false;
      });
      roomStore.updateRoomConfig("game_time");
      roomStore.updateRoomConfig("countdown");
    } else {
      showTypeInput.value = false;
    }
  }
};
const saveRoomSettings = () => {
  roomStore.saveRoomSettings();
};
const onFormatChange = (value) => {
  if (value % 2 === 0) {
    roomStore.roomSettings.format++;
  }
  roomStore.updateRoomConfig("need_win");
};
const onExtraLineCountChange = (value) => {
  roomStore.updateExtraLineCountCache(value);
  roomStore.updateRoomConfig("extra_line_count");
};
const onBoardSizeChange = async (value) => {
  if (value !== 5) {
    if (roomSettings.value.type === BingoType.BP) {
      roomSettings.value.type = BingoType.STANDARD;
    }
    if (roomSettings.value.type === BingoType.STANDARD && roomSettings.value.use_ai) {
      roomSettings.value.use_ai = false;
    }
  }
  roomSettings.value.extra_line_count =
    value === 6 && roomSettings.value.type === BingoType.STANDARD
      ? roomSettings.value.extraLineCountByBoardSize[value] ?? 0
      : 0;
  roomSettings.value.custom_level_count = roomSettings.value.customLevelCountByBoardSize[value] || roomStore.defaultCustomCountsForBoard(value);
  await roomStore.updateRoomConfig();
  if (useBoardSizeTimeSettings.value) {
    await roomStore.updateRoomConfig("game_time");
    await roomStore.updateRoomConfig("countdown");
  }
};
const standUp = () => {
  roomStore.standUp();
};
const sitDown = () => {
  roomStore.sitDown();
};

watch(inRoom, (val) => {
  if (val) {
    tabIndex.value = 1;
  } else {
    tabIndex.value = 0;
  }
});

watch(inGame, (val) => {
  if (val) {
    tabIndex.value = 2;
  }
});

watch(
  () => gameLogs,
  (val) => {
    nextTick(() => {
      scrollbar.value?.setScrollTop((scrollbar.value as any)?.wrap$?.offsetHeight as number);
    });
  }
);
const isLogButtonDisabled = ref(false);

const downloadGameLog = () => {
  if (isLogButtonDisabled.value) return;

  isLogButtonDisabled.value = true;
  ElMessage.info("正在生成对局记录...");

  Replay.fetchAndProcessGameLog().catch(() => {
    ElMessage.error("生成记录失败，请重试");
  });

  setTimeout(() => {
    isLogButtonDisabled.value = false;
  }, 10000); // 10秒内禁用
};

const replayDialogVisible = ref(false);
const replayCode = ref('');
const isReplayMode = computed(() => gameStore.isReplayMode);

const showReplayDialog = () => {
  replayDialogVisible.value = true;
};

// 开始回放
const startReplay = () => {
  if (replayCode.value.trim()) {
    try {
      Replay.parseReplayData(replayCode.value);
      Replay.startReplay();
      replayDialogVisible.value = false;

      // 切换到操作记录标签页
      tabIndex.value = 2;
    } catch (error) {
      ElMessage.error("回放代码解析失败: " + error);
    }
  } else {
    ElMessage.warning("请输入对局代码");
  }
};

const weightBalancerGameList = computed(() => {
  const list = [...activeGameList.value]

  // 如果游戏列表不为空，在开头插入特殊的均衡器滑块
  if (list.length > 0) {
    return [
      { code: 'weight_balancer', name: '生成波动'},
      ...list
    ]
  }

  return list
})

const showWeightBalancer = () => {
  weightBalancerVisible.value = true
}

const onCustomCardPoolChange = () => {
  onlineCustomPoolStore.selectPool(null);
  roomStore.applyCustomCardPoolSelection();
  roomStore.updateRoomConfig();
};

const onOnlinePoolSelected = () => {
  customCardPoolStore.selectSlot(null);
  roomStore.setOnlinePoolMd5(onlineCustomPoolStore.selectedMd5);
  roomStore.applyCustomCardPoolSelection();
  if (roomStore.roomId) roomStore.updateRoomConfig().catch(() => {});
};

// 处理权重确认
const handleWeightConfirm = (weights: Record<string, number>) => {
  // 更新roomSettings中的game_weight，保留所有游戏的权重设置
  roomSettings.value.game_weight = weights
  // 保存到服务器
  roomStore.updateRoomConfig('game_weight')
}

const showAIPreferenceBalancer = () => {
  aiPreferenceVisible.value = true
}
const handleAIPreferenceConfirm = (preferences: Record<string, number>) => {
  // 更新roomSettings中的ai_preference
  roomSettings.value.ai_preference = preferences
  // 保存到服务器
  roomStore.updateRoomConfig('ai_preference')
}

const showCustomLevelBalancer = () => {
  customLevelBalancerVisible.value = true;
};

const handleCustomLevelConfirm = (counts: number[]) => {
  currentCustomLevelCount.value = counts;
  roomSettings.value.custom_level_count = counts;
  roomStore.updateRoomConfig('custom_level_count');
};

const copyLinkBoardSettingsToDraft = () => {
  const defaults = defaultLinkBoardSettings();
  const area = currentBoardSize.value * currentBoardSize.value;
  const endpoint = (value: number | undefined, fallback: number) =>
    Number.isInteger(value) && value! >= 0 && value! < area ? value! : fallback;
  linkBoardDraft.value = {
    disabled: Array.isArray(roomSettings.value.link_disabled_idx)
      ? [...new Set(roomSettings.value.link_disabled_idx.filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < area))]
      : [],
    startA: endpoint(roomSettings.value.link_start_a, defaults.startA),
    endA: endpoint(roomSettings.value.link_end_a, defaults.endA),
    startB: endpoint(roomSettings.value.link_start_b, defaults.startB),
    endB: endpoint(roomSettings.value.link_end_b, defaults.endB),
  };
  linkBoardDraft.value.disabled = linkBoardDraft.value.disabled.filter((idx) => !linkEndpointSet.value.has(idx)).sort((a, b) => a - b);
};

const openLinkBoardSettings = () => {
  copyLinkBoardSettingsToDraft();
  linkBoardDialogVisible.value = true;
};

const handleLinkBoardCellClick = (index: number) => {
  if (inGame.value) return;
  const draft = linkBoardDraft.value;
  if (linkBoardEditMode.value === "disabled") {
    if (linkEndpointSet.value.has(index)) {
      ElMessage.warning("起点和终点不能禁用");
      return;
    }
    const disabled = new Set(draft.disabled);
    disabled.has(index) ? disabled.delete(index) : disabled.add(index);
    draft.disabled = Array.from(disabled).sort((a, b) => a - b);
    return;
  }
  const nextEndpoints = {
    startA: draft.startA,
    endA: draft.endA,
    startB: draft.startB,
    endB: draft.endB,
    [linkBoardEditMode.value]: index,
  };
  if (nextEndpoints.startA === nextEndpoints.endA || nextEndpoints.startB === nextEndpoints.endB) {
    ElMessage.warning("同一方起点和终点不能相同");
    return;
  }
  draft[linkBoardEditMode.value] = index;
  draft.disabled = draft.disabled.filter((idx) => idx !== index);
};

const resetLinkBoardSettings = () => {
  linkBoardDraft.value = defaultLinkBoardSettings();
};

const cancelLinkBoardSettings = () => {
  linkBoardDialogVisible.value = false;
  copyLinkBoardSettingsToDraft();
};

const saveLinkBoardSettings = () => {
  const draft = linkBoardDraft.value;
  roomSettings.value.linkBoardSettingsByBoardSize[currentBoardSize.value] = {
    disabled: [...draft.disabled],
    startA: draft.startA,
    endA: draft.endA,
    startB: draft.startB,
    endB: draft.endB,
  };
  roomSettings.value.link_disabled_idx = [...draft.disabled];
  roomSettings.value.link_start_a = draft.startA;
  roomSettings.value.link_end_a = draft.endA;
  roomSettings.value.link_start_b = draft.startB;
  roomSettings.value.link_end_b = draft.endB;
  roomStore.updateRoomConfig().then(() => {
    linkBoardDialogVisible.value = false;
  });
};

const customDifficultyButtonType = computed(() => {
  const counts = currentCustomLevelCount.value;
  if (!counts || counts.length < 5) {
    return 'danger';
  }
  const boardArea = roomSettings.value.board_size * roomSettings.value.board_size;
  const sum = counts.slice(0, 5).reduce((a, b) => a + b, 0);
  return sum === boardArea ? 'success' : 'danger';
});

// 检查生成权重是否有任何非默认值
const isWeightModified = computed(() => {
  const weights = roomSettings.value.game_weight;
  if (!weights || Object.keys(weights).length === 0) {
    return false;
  }
  // 检查是否有任何权重值不等于1（默认值为1）
  return Object.entries(weights).some(([key, value]) => {
    if (key !== "weight_balancer" && !activeGameList.value.some((game) => game.code === key)) return false;
    return value !== 0;
  });
});

const showDoc = ref(false);

// 折叠面板的展开状态，默认全部展开
const activeCollapseNames = ref(['basic', 'gameplay', 'game', 'playerA', 'playerB', 'general']);
</script>

<style scoped lang="scss">
.info-window {
  width: 100%;
  height: 100%;

  :deep(.el-form-item) {
    margin-bottom: 0;
  }

  .info {
    height: 100%;

    .info-tabs {
      height: 100%;

      :deep(.el-tabs__content) {
        height: calc(100% - 55px);
      }

      :deep(.el-tab-pane) {
        height: 100%;
      }
    }
  }
}

.user-info {
  text-align: left;
}
.room-info {
  text-align: left;
}

.room-info-none {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.form-flex-box {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-button {
  width: 100%;
  text-align: center;
  /* 调整 info-button 样式以容纳新按钮 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px; /* 按钮之间的间距 */
  margin-top: 20px;

  .el-button {
    margin-left: 0 !important; /* 覆盖 element-plus 的默认 margin */
    width: 120px; /* 可以统一按钮宽度 */
  }
}

.label-with-button {
  width: 100%;
  display: flex;
  justify-content: space-between;
}

.userName {
  width: 70%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.setting-title {
  text-align: left;
  margin-bottom: 5px;
  font-size: 16px;
  font-weight: 600;
}

.input-number {
  width: 96px;
}

.input-number-text {
  margin-left: 5px;
}

.link-board-config {
  display: flex;
  gap: 18px;
  align-items: flex-start;
  padding: 4px 0;
}

.link-board-grid {
  display: grid;
  width: 336px;
  gap: 6px;
  padding: 10px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  background: #f8fafc;
}

.link-board-cell {
  position: relative;
  aspect-ratio: 1;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #fff;
  color: #303133;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.link-board-cell:hover:not(:disabled) {
  border-color: #409eff;
  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.2);
  transform: translateY(-1px);
}

.link-board-cell.disabled {
  border-color: #c8cdd6;
  background: repeating-linear-gradient(135deg, #f2f3f5 0, #f2f3f5 6px, #e4e7ed 6px, #e4e7ed 12px);
  color: #606266;
  text-decoration: line-through;
}

.link-board-cell.endpoint {
  border-color: #2f80ff;
  background: linear-gradient(180deg, #ecf5ff, #dcecff);
  color: #174f91;
  font-weight: 600;
  text-decoration: none;
}

.link-board-cell-index {
  position: absolute;
  top: 2px;
  left: 4px;
  color: #909399;
  font-size: 10px;
  font-weight: 400;
}

.link-board-cell-labels {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, max-content));
  justify-content: center;
  align-content: center;
  gap: 3px;
  min-height: 28px;
  padding-top: 8px;
}

.link-board-cell-label {
  min-width: 22px;
  padding: 2px 3px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.72);
  line-height: 1.1;
  text-align: center;
}

.link-board-controls {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-width: 230px;
}

.link-board-panel-title {
  color: #303133;
  font-size: 13px;
  font-weight: 600;
}

.link-board-mode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  :deep(.el-radio-button__inner) {
    width: 100%;
    border-left: 1px solid var(--el-border-color);
    border-radius: 4px;
  }
}

.link-board-summary-panel {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fff;
  color: #303133;
  font-size: 13px;

  span {
    display: inline-flex;
    justify-content: center;
    width: 24px;
    margin-right: 8px;
    border-radius: 3px;
    background: #ecf5ff;
    color: #1f5fa8;
    font-weight: 600;
  }
}

.link-board-hint {
  color: #606266;
  font-size: 12px;
  line-height: 18px;
}

.log-list {
  text-align: left;
  margin-right: 6px;
}

.log-list-item {
  margin-bottom: 4px;
}

.doc-button-container {
  position: absolute;
  bottom: 10px;
  right: 10px;
}

.doc-button {
  width: 40px;
  height: 40px;
  font-size: 20px;
}

:deep(.el-collapse) {
  border: none;
  background-color: rgba(0, 0, 0, 0.0);
}

:deep(.el-collapse-item__header) {
  font-size: 15px;
  font-weight: 600;
  background-color: rgba(0, 0, 0, 0.0);
  border-radius: 2px;
  margin-bottom: 6px;
  height: 28px;
  line-height: 28px;
  display: flex;
  align-items: center; /* 垂直居中 */
  min-height: 28px;
  padding: 0 4px;
  width: 280px;
}

:deep(.el-collapse-item__wrap) {
  border: none;
  background-color: transparent;
}

:deep(.el-collapse-item__content) {
  padding-bottom: 10px;
  background-color: transparent;
}
</style>
