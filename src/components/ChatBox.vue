<template>
  <div class="chat-container">
    <div class="header">
      <div class="title-info">
        <div class="avatar-container" @click="handleSecretTrigger">
          <img v-if="config.aiAvatar" :src="config.aiAvatar" class="avatar-img" />
          <el-icon v-else :size="30" color="#fff">
            <Service />
          </el-icon>
        </div>
        <div class="text-area">
          <span class="name">{{ config.aiName || '记录管家' }}</span>
          
          <el-tag class="rainbow-tag" size="small">
             您的私人记录管家，基于 {{ config.modelProvider === 'qwen' ? 'Qwen3-8B' : 'DeepSeek V3' }}大模型
          </el-tag>
          </div>
      </div>

      <div class="header-actions">
        <el-button circle text @click="handleClearChat" title="清空聊天记录">
          <el-icon :size="20" color="#fff">
            <Delete />
          </el-icon>
        </el-button>
        <el-button circle text @click="openSettings" title="设置">
          <el-icon :size="20" color="#fff">
            <Setting />
          </el-icon>
        </el-button>
      </div>
    </div>

    <div class="messages" ref="messagesContainer">
      <div v-for="(msg, index) in messages" :key="index" class="message-row"
        :class="{ 'message-user': msg.role === 'user', 'message-ai': msg.role === 'ai' }">
        <div class="msg-avatar ai-avatar" v-if="msg.role === 'ai'">
          <img v-if="config.aiAvatar" :src="config.aiAvatar" />
          <el-icon v-else>
            <Service />
          </el-icon>
        </div>

        <div class="bubble markdown-content" v-html="renderMarkdown(msg.content)"></div>

        <div class="msg-avatar user-avatar" v-if="msg.role === 'user'">
          <img v-if="config.userAvatar" :src="config.userAvatar" />
          <el-icon v-else>
            <User />
          </el-icon>
        </div>
      </div>

      <div class="message-row" v-if="loading">
        <div class="msg-avatar ai-avatar">
          <img v-if="config.aiAvatar" :src="config.aiAvatar" />
          <el-icon v-else>
            <Service />
          </el-icon>
        </div>
        <div class="bubble loading-bubble">
           让我想想...
        </div>
      </div>
    </div>

    <transition name="fade">
      <div 
        v-if="showTokenMonitor" 
        class="token-monitor-panel" 
        :style="{ transform: `translate(${monitorPos.x}px, ${monitorPos.y}px)` }"
      >
        <div class="monitor-header" @mousedown="startDrag" style="cursor: move; user-select: none;">
          <span>📡 实时监控</span>
          <span class="close-btn" @click.stop="showTokenMonitor = false" @mousedown.stop>×</span>
        </div>
        
        <div class="monitor-content">
          <div v-if="tokenLogs.length === 0" class="empty-log">暂无本次会话数据</div>
          <div v-for="(log, idx) in tokenLogs" :key="idx" class="log-item">
            <div class="log-time">{{ log.time }}</div>

            <div class="log-row"><span>命中日期:</span> <span>{{ log.datas }}</span></div>
            
            <div class="log-row">
              <span>提问 ({{ log.prompt }}):</span>
              <span style="color: #ff6b6b;" title="未命中缓存">
                 {{ log.miss }} miss
              </span>
            </div>
            
            <div class="log-row">
              <span>缓存命中:</span> 
              <span :style="{ color: log.hit > 0 ? '#67c23a' : '#909399' }">
                {{ log.hit }} hit
              </span>
            </div>

            <div class="log-row"><span>回答:</span> <span>{{ log.completion }} tokens</span></div>
            
            <div style="border-top: 1px dashed rgba(255,255,255,0.1); margin: 4px 0;"></div>
            
            <div class="log-row">
              <span>总Token:</span> 
              <span>{{ log.total }}</span>
            </div>
            <div class="log-row total-cost">
              <span>预估费用:</span> 
              <span>¥{{ log.cost }}</span>
            </div>
          </div>
        </div>
        <div class="monitor-footer">
          <div>累计 Token: {{ totalSessionTokens }}</div>
          <div style="color: #ffd700; font-size: 13px;">累计花费: ¥{{ totalSessionCost }}</div>
        </div>
      </div>
    </transition>

    <div class="input-area">
      <el-input v-model="inputMessage" placeholder="和记录管家聊聊..." @keyup.enter="sendMessage" :disabled="loading">
        <template #append>
          <el-button @click="sendMessage" :loading="loading">发送</el-button>
        </template>
      </el-input>
    </div>

    <el-dialog 
      v-model="showSettings" 
      title="管家设置" 
      width="600px" 
      class="custom-settings-modal"
      :close-on-click-modal="false"
      align-center
    >
      <el-form label-position="top">
        
        <el-divider content-position="left">模型大脑选择</el-divider>
        <el-form-item>
<div class="model-selector">
  <div 
    class="model-card" 
    :class="{ active: tempConfig.modelProvider === 'qwen' }"
    @click="tempConfig.modelProvider = 'qwen'"
  >
    <div class="card-header">
      <div class="card-icon qwen-icon">
        <svg t="1770710499376" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="10428" width="200" height="200"><path d="M536.64 77.888c16 28.096 31.872 56.256 47.808 84.48 1.28 2.304 3.712 3.712 6.4 3.712h226.112c7.04 0 13.12 4.48 18.112 13.312l59.264 104.64c7.68 13.76 9.728 19.52 0.96 34.112-10.56 17.536-20.864 35.2-30.976 52.928l-14.912 26.816c-4.352 8-9.088 11.392-1.664 20.864l108.032 188.8c7.04 12.288 4.48 20.16-1.728 31.36-17.792 32-35.968 63.744-54.4 95.36-6.464 11.072-14.336 15.232-27.712 15.04-31.616-0.64-63.168-0.384-94.72 0.64a4.032 4.032 0 0 0-3.328 2.048 23421.76 23421.76 0 0 1-110.144 193.024c-6.912 11.968-15.488 14.784-29.568 14.848-40.576 0.128-81.536 0.192-122.88 0.064a21.888 21.888 0 0 1-18.944-11.008l-54.336-94.592a3.648 3.648 0 0 0-3.392-2.048H226.176c-11.584 1.28-22.528 0-32.768-3.712l-65.28-112.832A22.144 22.144 0 0 1 128 713.792l49.152-86.4a8.064 8.064 0 0 0 0-8c-25.6-44.352-51.072-88.768-76.352-133.248l-32.192-56.832c-6.528-12.608-7.04-20.16 3.84-39.296 18.944-33.088 37.76-66.176 56.512-99.2 5.376-9.536 12.352-13.568 23.808-13.632 35.136-0.128 70.272-0.192 105.408 0a5.056 5.056 0 0 0 4.352-2.56L376.96 75.136a19.84 19.84 0 0 1 17.152-9.984c21.376-0.064 42.88 0 64.512-0.256L499.968 64c13.888-0.128 29.44 1.28 36.672 13.888zM396.8 94.272a2.432 2.432 0 0 0-2.112 1.28l-116.736 204.16a6.4 6.4 0 0 1-5.504 3.2H155.776c-2.304 0-2.88 1.024-1.664 3.008l236.608 413.632c1.024 1.728 0.512 2.56-1.344 2.56l-113.92 0.64a8.896 8.896 0 0 0-8.064 4.672l-53.76 94.08c-1.792 3.2-0.896 4.8 2.752 4.8l232.768 0.384c1.92 0 3.264 0.768 4.288 2.432l57.088 99.968c1.92 3.328 3.776 3.328 5.696 0l203.84-356.736 31.936-56.32a2.24 2.24 0 0 1 3.84 0l58.048 103.04c0.896 1.6 2.56 2.56 4.352 2.56l112.512-0.832a1.6 1.6 0 0 0 1.472-2.432L814.08 411.2a4.416 4.416 0 0 1 0-4.608l11.968-20.608 45.568-80.512c1.024-1.728 0.512-2.56-1.408-2.56H397.952c-2.368 0-2.944-1.024-1.728-3.136l58.432-102.016a4.352 4.352 0 0 0 0-4.672l-55.68-97.536a2.432 2.432 0 0 0-2.112-1.28z m256.128 326.656c1.92 0 2.368 0.768 1.408 2.432l-33.92 59.648-106.368 186.752a2.304 2.304 0 0 1-2.048 1.152 2.368 2.368 0 0 1-2.048-1.152L369.408 424.064c-0.832-1.344-0.448-2.112 1.152-2.176l8.768-0.512 273.792-0.448h-0.128z" fill="#000000" fill-opacity=".85" p-id="10429"></path></svg>
      </div>
      <div class="card-info">
        <div class="card-title">Qwen 3.0 (推荐)</div>
        <div class="card-desc">永久免费，极速响应</div>
      </div>
      <div class="check-mark" v-if="tempConfig.modelProvider === 'qwen'">
        <el-icon><Select /></el-icon>
      </div>
    </div>
  </div>

  <div 
    class="model-card" 
    :class="{ active: tempConfig.modelProvider === 'deepseek' }"
    @click="tempConfig.modelProvider = 'deepseek'"
  >
    <div class="card-header">
      <div class="card-icon deepseek-icon">
        <svg t="1770710555704" class="icon" viewBox="0 0 1391 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="13070" width="200" height="200"><path d="M1382.12555807 63.45623157c-14.73053987-7.36694577-21.0903122 6.67482826-29.69569586 13.81050954-2.93270133 2.3025895-5.43639037 5.2956207-7.94007938 8.05738747-21.52435201 23.478369-46.67184703 38.90270222-79.56167359 37.06096578-48.0527304-2.76176674-89.0854117 12.66089063-125.34197943 50.18270947-7.71049077-46.26964801-33.3205147-73.89234293-72.3086842-91.61758983-20.43003543-9.20700638-41.0326813-18.41568859-55.33420887-38.44352498-9.95442626-14.27136261-12.66089063-30.15487307-17.66659288-45.80711909-3.16564161-9.43827083-6.33128325-19.10613027-16.97615117-20.71827809-11.59673901-1.84173644-16.11477489 8.05738745-20.66129987 16.34436353-18.12744594 33.83834596-25.17765995 71.1305762-24.45872917 108.88198365 1.55516963 84.94276158 36.71742076 152.6194535 106.52409176 200.73083796 7.94175522 5.52353348 9.98459118 11.04874282 7.48090216 19.10445442-4.74762451 16.57395213-10.44544426 32.68872704-15.42265737 49.2626792-3.16731744 10.58956558-7.91326613 12.89047925-19.04915208 8.28697605-38.29940365-16.34436352-71.39032974-40.51485003-100.65366161-69.74801697-49.63471329-49.03309056-94.5234779-103.12886155-150.48947443-145.4837722a661.8118183 661.8118183 0 0 0-39.90987567-27.85395942c-57.11729129-56.62794912 7.48090217-103.12718572 22.44438231-108.65239505 15.62375691-5.75479794 5.4380662-25.5513699-45.11835322-25.32178128s-96.79757829 17.49565827-155.72811695 40.51485003c-8.63052108 3.45220843-17.69675779 5.98438656-26.96074236 8.05738749-53.52096153-10.35997695-109.05459409-12.66089063-167.09359148-5.9860624-109.2556936 12.43130203-196.52953378 65.14618963-260.69536329 155.15163164-77.05798457 108.19154197-95.21559542 231.11697547-72.97231263 359.33467803 23.30743442 135.12547108 90.89698322 247.00048593 194.71628647 334.47374981 107.67371071 90.69588368 231.66329585 135.12547108 373.11837431 126.60890637 85.91977008-5.06603207 181.56605365-16.80521659 289.46935296-110.03495422 27.22049591 13.8121854 55.79338609 19.33739472 103.15735067 23.48004484 36.51464541 3.45220843 71.64840745-1.84173644 98.84041425-7.59653439 42.6146642-9.20700638 39.6501221-49.4922678 24.25595382-56.85753775-124.90961545-59.39139169-97.48802001-35.22090515-122.40592638-54.78621268 63.47538778-76.65578551 159.12167135-156.30460223 196.52953378-414.35215512 2.96286625-20.48701364 0.45917725-33.37749289 0-49.95144506-0.23126445-10.12871251 2.01267102-14.04344985 13.37982144-15.19306875 31.27767874-3.68347287 61.66381626-12.43130203 89.54626476-28.08354804 80.91239203-45.11835324 113.57095414-119.24196063 121.28312075-208.0977837 1.15129475-13.58092095-0.22958861-27.62269495-14.30152755-34.75837626M676.89467748 863.15361188c-121.02504304-97.14279917-179.75448214-129.13940867-204.01043596-127.75852533-22.67397092 1.38088338-18.588299 27.85395941-13.61108589 45.11835324 5.20847758 17.03480522 12.02742715 28.77398972 21.55116528 43.73746986 6.56254768 9.89912389 11.10907268 24.63133958-6.58768512 35.68008242-38.98984534 24.63133958-106.75368041-8.28697606-109.9176462-9.89744807-78.89972099-47.42094273-144.88047363-110.03495424-191.35122116-195.66648169-44.88708879-82.41058346-70.92780085-170.80555349-75.24473718-265.18491008-1.15129475-22.78960315 5.4380662-30.84699058 27.62437077-34.99131655a267.60145597 267.60145597 0 0 1 88.65304773-2.30091365c123.55889699 18.41736442 228.75740777 74.81404907 316.92111337 164.13072521 50.32683081 50.87147534 88.39497004 111.64375041 127.64289309 171.0351421 41.69463388 63.07151293 86.58339852 123.15334628 143.70068976 172.41434965 20.17028189 17.26439385 36.25489187 30.38613755 51.67754928 40.05399698-46.4707475 5.2956207-124.01639839 6.44523963-177.04801777-36.37052409m58.03732158-380.97298644c0-10.12871251 7.94343105-18.18609998 17.92634639-18.18609998q3.39523024 0.05865402 6.10001881 1.15129477a18.04197865 18.04197865 0 0 1 11.56824991 17.03480521 17.95483551 17.95483551 0 0 1-17.89785732 18.18609997 17.753736 17.753736 0 0 1-17.69675779-18.18609997m180.21533522 94.3793566c-11.53976081 4.83476764-23.10633489 8.97909357-34.24222086 9.43827083-17.20741563 0.92170613-36.02530325-6.21397518-46.21099397-14.96180432-15.88351045-13.58259677-27.22217175-21.17913115-31.96979625-44.88876463-2.04283596-10.12871251-0.92170613-25.78095852 0.89321705-34.75837629 4.08567191-19.33739472-0.46085308-31.7670209-13.8121854-43.04702813-10.87613241-9.20868221-24.71848271-11.74086034-39.90987566-11.74086036-5.66933063 0-10.87613241-2.5305023-14.73221569-4.60350318a15.10592564 15.10592564 0 0 1-6.56087184-21.17745534c1.5819829-3.22261982 9.29414949-11.05041866 11.10739683-12.43130199 20.62945915-11.97044896 44.42623571-8.05571162 66.40976495 0.92170611 20.40154635 8.51656469 35.79571462 24.17048652 58.03899743 46.269648 22.67397092 26.70266465 26.75964283 34.06961042 39.6501221 54.09577099 10.21585563 15.65224602 19.51000513 31.7670209 25.84128837 50.18103364 3.88289657 11.51127171-1.12280565 20.9478667-14.50262706 26.70266467" fill="#4D6BFE" p-id="13071"></path></svg>
</div>
      <div class="card-info">
        <div class="card-title">DeepSeek V3</div>
        <div class="card-desc">国内顶级，便宜实惠</div>
      </div>
      <div class="check-mark" v-if="tempConfig.modelProvider === 'deepseek'">
         <el-icon><Select /></el-icon>
      </div>
    </div>
  </div>
</div>
        </el-form-item>

        <div v-if="tempConfig.modelProvider === 'qwen'" class="api-config-box">
             <el-form-item>
              <template #label>
                <div style="display: flex; align-items: center;">
                  <span>SiliconFlow API Key</span>
                  <el-button type="danger" link size="small" style="margin-left: 10px;" @click="openSiliconFlowUrl">
                    <el-icon style="margin-right: 2px"><Link /></el-icon> 官网免费注册获取
                  </el-button>
                </div>
              </template>
              <el-input v-model="tempConfig.qwenApiKey" type="password" placeholder="sk-xxxxxxxx (硅基流动Key)" show-password />
            </el-form-item>
        </div>

        <div v-if="tempConfig.modelProvider === 'deepseek'" class="api-config-box">
             <el-form-item>
              <template #label>
                <div style="display: flex; align-items: center;">
                  <span>DeepSeek API Key</span>
                  <el-button type="danger" link size="small" style="margin-left: 10px;" @click="openDeepSeekUrl">
                    <el-icon style="margin-right: 2px"><Link /></el-icon> 官网注册获取
                  </el-button>
                </div>
              </template>
              <el-input v-model="tempConfig.apiKey" type="password" placeholder="sk-xxxxxxxx" show-password />
            </el-form-item>
        </div>

        <el-divider content-position="left">基础设置</el-divider>
        <el-row :gutter="20">
             <el-col :span="12">
                <el-form-item label="应用启动密码">
                     <el-input v-model="tempConfig.password" type="password" show-password placeholder="可选，留空则不设防" />
                </el-form-item>
             </el-col>
             <el-col :span="12">
                <el-form-item label="启动时问候">
                     <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; height: 32px;">
                        <span style="font-size: 12px; color: #999;">开启后每次打开生成问候语</span>
                        <el-switch v-model="tempConfig.enableGreeting" />
                     </div>
                </el-form-item>
             </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12"><el-form-item label="主人昵称"><el-input v-model="tempConfig.userName" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="管家昵称"><el-input v-model="tempConfig.aiName" /></el-form-item></el-col>
        </el-row>
        
        <el-form-item :label="`${tempConfig.aiName || '管家'}性格设定`">
           <el-button type="warning" plain style="width: 100%" @click="showPersonality = true">
             <el-icon style="margin-right: 5px"><EditPen /></el-icon>
             点击编辑详细人设 / Prompt
           </el-button>
           </el-form-item>

        <el-row :gutter="20" style="margin-top: 5px;">
           <el-col :span="13">
             <el-divider content-position="left">形象设置</el-divider>
             <div class="avatar-upload-section">
                <div class="upload-item">
                  <span class="label">主人头像</span>
                  <el-upload class="avatar-uploader" action="http://localhost:3000/api/upload-avatar" :show-file-list="false" :on-success="handleUserAvatarSuccess" name="avatar">
                    <img v-if="tempConfig.userAvatar" :src="tempConfig.userAvatar" class="avatar" />
                    <el-icon v-else class="avatar-uploader-icon"><Plus /></el-icon>
                  </el-upload>
                </div>
                <div class="upload-item">
                  <span class="label">管家头像</span>
                  <el-upload class="avatar-uploader" action="http://localhost:3000/api/upload-avatar" :show-file-list="false" :on-success="handleAiAvatarSuccess" name="avatar">
                    <img v-if="tempConfig.aiAvatar" :src="tempConfig.aiAvatar" class="avatar" />
                    <el-icon v-else class="avatar-uploader-icon"><Plus /></el-icon>
                  </el-upload>
                </div>
             </div>
           </el-col>
           
           <el-col :span="11">
             <el-divider content-position="left">数据迁移</el-divider>
             <div class="migration-box">
                <div class="migration-item" @click="handleExportData">
                   <div class="mig-icon"><el-icon><Download /></el-icon></div>
                   <div class="mig-text">
                     <div class="mig-title">导出备份</div>
                     <div class="mig-desc">保存日记、规划与设置</div>
                   </div>
                </div>
                <el-upload
                   action="http://localhost:3000/api/import-data"
                   :show-file-list="false"
                   :on-success="handleImportSuccess"
                   class="migration-uploader"
                   name="file"
                >
                  <div class="migration-item">
                     <div class="mig-icon"><el-icon><Upload /></el-icon></div>
                     <div class="mig-text">
                       <div class="mig-title">恢复数据</div>
                       <div class="mig-desc">上传<span style="color: #ff6b6b;">zip</span>文件覆盖当前记录</div>
                     </div>
                  </div>
                </el-upload>
             </div>
           </el-col>
        </el-row>

      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showSettings = false">取消</el-button>
          <el-button type="primary" @click="saveSettings">保存全部设置</el-button>
        </span>
      </template>
    </el-dialog>

    <el-dialog 
      v-model="showPersonality" 
      :title="`${tempConfig.aiName || '管家'} - 详细人设编辑`" 
      width="650px" 
      append-to-body
      class="personality-dialog"
    >
       <el-alert title="Prompt 编写技巧：你可以定义它的身世背景、说话口癖、对待主人的态度，甚至是禁止它做的事情。按行分隔效果更好。" type="info" show-icon :closable="false" style="margin-bottom: 15px;" />
       
       <el-input
         v-model="tempConfig.personality"
         type="textarea"
         :rows="18"
         placeholder="[示例]
          你叫小黑，是主人忠诚的数字管家。
          性格：高冷、毒舌，但内心非常关心主人。
          说话风格：简洁有力，喜欢用反问句，偶尔会用颜文字 (¬_¬)。
          特殊指令：如果主人很晚还在记日记，你要催他去睡觉。"
         style="font-size: 14px; line-height: 1.6;"
       />
       <template #footer>
         <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 12px; color: #909399;">这里修改后，记得回主设置点击“保存全部设置”生效。</span>
            <el-button type="primary" @click="showPersonality = false">完成编辑</el-button>
         </div>
       </template>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, computed } from 'vue';
import { Service, User, Setting, Plus, Delete, Link, Select, EditPen, Download, Upload } from '@element-plus/icons-vue';
import axios from 'axios';
import { ElMessage, ElMessageBox } from 'element-plus';
import { marked } from 'marked';

const PRICE = {
  INPUT_HIT: 0.2 / 1000000,
  INPUT_MISS: 2.0 / 1000000,
  OUTPUT: 3.0 / 1000000 
};

const inputMessage = ref('');
const loading = ref(false);
const showSettings = ref(false);
const showPersonality = ref(false); 
const messagesContainer = ref<HTMLElement | null>(null);

const messages = ref([
  { role: 'ai', content: '主人好呀！' }
]);

const config = ref({
  userName: '主人',
  aiName: '记录管家',
  userAvatar: '',
  aiAvatar: '',
  personality: '',
  apiKey: '',
  qwenApiKey: '', 
  modelProvider: 'qwen', 
  password: '',
  enableGreeting: true
});

const tempConfig = ref({ ...config.value });
const API_BASE = 'http://localhost:3000/api';

const emit = defineEmits(['data-restored']); 

// --- 监控数据 ---
const secretClickCount = ref(0);
const showTokenMonitor = ref(false);
const tokenLogs = ref<Array<{
  time: string, 
  prompt: number, 
  completion: number, 
  total: number,
  hit: number,
  miss: number,
  cost: string,
  datas: string[],
}>>([]);

const monitorPos = ref({ x: 0, y: 0 }); 
let dragStartPoint = { x: 0, y: 0 };    
let dragStartPos = { x: 0, y: 0 };      
let isDragging = false;

let clickTimer: any = null;

const totalSessionTokens = computed(() => {
  return tokenLogs.value.reduce((sum, log) => sum + log.total, 0);
});

const totalSessionCost = computed(() => {
  const sum = tokenLogs.value.reduce((sum, log) => sum + parseFloat(log.cost), 0);
  return sum.toFixed(5);
});

const handleSecretTrigger = () => {
  secretClickCount.value++;
  if (clickTimer) clearTimeout(clickTimer);
  clickTimer = setTimeout(() => { secretClickCount.value = 0; }, 2000);

  if (secretClickCount.value >= 10) {
    showTokenMonitor.value = !showTokenMonitor.value;
    secretClickCount.value = 0;
    if (showTokenMonitor.value) {
      ElMessage.success('开发者模式：费用监控已开启');
    }
  }
};

const startDrag = (e: MouseEvent) => {
  isDragging = true;
  dragStartPoint = { x: e.clientX, y: e.clientY };
  dragStartPos = { ...monitorPos.value };
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup', stopDrag);
};

const onDrag = (e: MouseEvent) => {
  if (!isDragging) return;
  const dx = e.clientX - dragStartPoint.x;
  const dy = e.clientY - dragStartPoint.y;
  monitorPos.value = {
    x: dragStartPos.x + dx,
    y: dragStartPos.y + dy
  };
};

const stopDrag = () => {
  isDragging = false;
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('mouseup', stopDrag);
};

onMounted(async () => {
  await fetchConfig();
  getGreeting();
});

const renderMarkdown = (text: string) => { if (!text) return ''; return marked.parse(text); };
const openDeepSeekUrl = () => { window.open('https://platform.deepseek.com/api_keys', '_blank'); };
const openSiliconFlowUrl = () => { window.open('https://cloud.siliconflow.cn/me/account/ak', '_blank'); };

const fetchConfig = async () => { 
  try { 
    const res = await axios.get(`${API_BASE}/config`); 
    if (res.data.success) { 
      const loadedConfig = res.data.config; 
      if (loadedConfig.enableGreeting === undefined) loadedConfig.enableGreeting = true;
      if (!loadedConfig.modelProvider) loadedConfig.modelProvider = 'qwen'; 
      config.value = loadedConfig; 
    } 
  } catch (e) { } 
};

const getGreeting = async () => { if (config.value.enableGreeting === false) return; try { const res = await axios.get(`${API_BASE}/greeting`); if (res.data.success && res.data.reply) messages.value[0].content = res.data.reply; } catch (e) { } };

const sendMessage = async () => {
  if (!inputMessage.value.trim()) return;
  const userText = inputMessage.value;
  
  messages.value.push({ role: 'user', content: userText });
  inputMessage.value = '';
  scrollToBottom();

  loading.value = true;
  try {
    const rawHistory = messages.value.slice(0, -1).slice(-10);
    const historyPayload = rawHistory.map(msg => ({
      role: msg.role === 'ai' ? 'assistant' : 'user',
      content: msg.content
    }));

    const res = await axios.post(`${API_BASE}/chat`, { 
      message: userText,
      history: historyPayload 
    });
    
    loading.value = false;
    
    if (res.data.success) {
      messages.value.push({ role: 'ai', content: res.data.reply });
      
      if (res.data.usage) {
        const u = res.data.usage;
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
        
        const hit = u.prompt_cache_hit_tokens || 0;
        const miss = u.prompt_cache_miss_tokens || u.prompt_tokens;
        const output = u.completion_tokens || 0;

        const datas = res.data.dates;
        
        let costVal = 0;
        if (config.value.modelProvider !== 'qwen') {
            costVal = (hit * PRICE.INPUT_HIT) + (miss * PRICE.INPUT_MISS) + (output * PRICE.OUTPUT);
        }

        tokenLogs.value.unshift({
          time: timeStr,
          prompt: u.prompt_tokens,
          completion: output,
          total: u.total_tokens,
          hit: hit,
          miss: miss,
          cost: costVal.toFixed(5),
          datas
        });
      }
    } else {
      messages.value.push({ role: 'ai', content: res.data.reply || res.data.message });
    }
    scrollToBottom();
  } catch (error) {
    loading.value = false;
    messages.value.push({ role: 'ai', content: '呜呜，网络好像断了...' });
  }
};

const openSettings = () => { tempConfig.value = JSON.parse(JSON.stringify(config.value)); showSettings.value = true; };
const saveSettings = async () => { 
  try { 
    await axios.post(`${API_BASE}/config`, tempConfig.value); 
    config.value = { ...tempConfig.value }; 
    showSettings.value = false; 
    ElMessage.success('配置已保存'); 
    if (config.value.enableGreeting) getGreeting(); 
  } catch (e) { 
    ElMessage.error('保存失败'); 
  } 
};
const handleUserAvatarSuccess = (res: any) => { if (res.success) tempConfig.value.userAvatar = res.url; };
const handleAiAvatarSuccess = (res: any) => { if (res.success) tempConfig.value.aiAvatar = res.url; };
const scrollToBottom = () => { nextTick(() => { if (messagesContainer.value) messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight; }); };
const handleClearChat = () => { if (messages.value.length === 0) return; ElMessageBox.confirm('确定要清空当前的对话记录吗？', '清空聊天', { confirmButtonText: '确定清空', cancelButtonText: '我点错了', type: 'warning', }).then(() => { messages.value = []; getGreeting(); ElMessage.success('屏幕已擦除干净 ✨'); }).catch(() => { }); };

// --- 迁移功能函数 ---
const handleExportData = () => {
  window.location.href = `${API_BASE}/export-data`;
};

const handleImportSuccess = async (res: any) => {
  if (res.success) {
    ElMessage.success('数据恢复成功！');
    await fetchConfig(); 
    tempConfig.value = { ...config.value }; 
    
    // 【新增】告诉父组件：数据恢复了，请通知其他人刷新！
    emit('data-restored'); 
  } else {
    ElMessage.error('数据恢复失败: ' + (res.message || '未知错误'));
  }
};
</script>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 438px;
  background-color: #f5f7fa;
  border-right: 1px solid #e0e0e0;
  position: relative;
}

.header {
  height: 60px;
  background-color: #2c3e50;
  padding: 0 15px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: white;
}

.title-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar-container {
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: transform 0.1s;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.text-area {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.name {
  font-weight: bold;
  font-size: 16px;
}

.subtitle {
  font-size: 12px;
  opacity: 0.8;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.message-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: 90%;
}

.message-user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.message-ai {
  align-self: flex-start;
}

.msg-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.msg-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bubble {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-all;
}

.message-ai .bubble {
  background-color: #fff;
  border: 1px solid #e0e0e0;
  border-top-left-radius: 0;
}

.message-user .bubble {
  background-color: #409eff;
  color: white;
  border-top-right-radius: 0;
}

.markdown-content :deep(p) {
  margin: 5px 0;
}

.markdown-content :deep(p:first-child) {
  margin-top: 0;
}

.markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 5px 0 5px 20px;
  padding: 0;
}

.markdown-content :deep(li) {
  margin: 2px 0;
}

.markdown-content :deep(strong) {
  font-weight: bold;
  color: #2c3e50;
}

.loading-bubble {
  padding: 5px 12px;
}

.input-area {
  padding: 15px;
  background: #fff;
  border-top: 1px solid #e0e0e0;
}

/* --- 这里开始是主要修改的部分 --- */
.avatar-upload-section {
  display: flex;
  gap: 30px;
  margin-top: 10px;
}

.upload-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.label {
  font-size: 12px;
  color: #666;
}

.avatar-uploader {
  border: 1px dashed #d9d9d9;
  border-radius: 6px;
  cursor: pointer;
  width: 94px;  /* 保持大尺寸 */
  height: 94px;
  overflow: hidden;
  transition: border-color 0.3s;
  /* 注意：这里删除了 display: flex，交给内部的 el-upload 去处理布局 */
}

/* 新增：强制让内部的点击触发区域撑满整个框 */
.avatar-uploader :deep(.el-upload) {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-uploader:hover {
  border-color: #409eff;
}

.avatar-uploader-icon {
  font-size: 28px;
  color: #8c939d;
}

.avatar {
  width: 100%;   /* 改为 100% 适应父容器 */
  height: 100%;  /* 改为 100% 适应父容器 */
  display: block;
  object-fit: cover;
}


.header-actions .el-button:hover {
  background-color: rgba(0, 0, 0, 0.2) !important;
}

.el-button--primary {
  background-color: #505860;
  border: none;
}

.token-monitor-panel {
  position: fixed;
  right: 20px;
  bottom: 80px;
  width: 250px;
  height: 350px;
  background-color: rgba(44, 62, 80, 0.95);
  color: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  z-index: 9999;
  overflow: hidden;
  font-size: 12px;
  border: 1px solid #505860;
}

.monitor-header {
  padding: 10px;
  background-color: rgba(0, 0, 0, 0.2);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.close-btn {
  cursor: pointer;
  font-size: 16px;
  padding: 0 5px;
}

.close-btn:hover {
  color: #ff6b6b;
}

.monitor-content {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.monitor-content::-webkit-scrollbar {
  width: 4px;
}

.monitor-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.log-item {
  background: rgba(255, 255, 255, 0.05);
  padding: 8px;
  border-radius: 6px;
}

.log-time {
  color: #aaa;
  font-size: 10px;
  margin-bottom: 4px;
}

.log-row {
  display: flex;
  justify-content: space-between;
  line-height: 1.4;
}

.log-row.total-cost {
  color: #ffd700;
  font-weight: bold;
}

.empty-log {
  text-align: center;
  color: #666;
  margin-top: 20px;
}

.monitor-footer {
  padding: 8px;
  text-align: center;
  background-color: rgba(0, 0, 0, 0.3);
  font-weight: bold;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.rainbow-tag {
  background-color: transparent !important;
  border: 1px solid rgba(255, 255, 255, 0.479) !important;
  font-weight: bold;
  padding: 0 6px;
  height: 20px;
  line-height: 18px;
  background: linear-gradient(
    to right,
    #ff2400,
    #e81d1d,
    #e8b21d,
    #e3e81d,
    #1de840,
    #1ddde8,
    #8a82ff,
    #dd00f3,
    #dd00f3
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent !important;
  animation: rainbow-flow 100s linear infinite;
}

@keyframes rainbow-flow {
  0% {
    background-position: 0% center;
  }
  100% {
    background-position: 200% center;
  }
}

.api-config-box {
  background: #f8f9fa;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid #eee;
}

.model-selector {
  display: flex;
  gap: 15px;
  width: 100%;
}

.model-card {
  flex: 1;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  background-color: #fff;
}

.model-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  border-color: #c0c4cc;
}

.model-card.active {
  background-color: #f0f9eb;
  border-color: #67c23a;
  box-shadow: 0 0 0 1px #67c23a inset;
}

.model-card.active:nth-child(2) {
  background-color: #ecf5ff;
  border-color: #409eff;
  box-shadow: 0 0 0 1px #409eff inset;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.qwen-icon {
  background-color: #e1f3d8;
  color: #67c23a;
}

.deepseek-icon {
  background-color: #d9ecff;
  color: #409eff;
}

.card-info {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.card-title {
  font-weight: bold;
  font-size: 14px;
  color: #303133;
}

.card-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.check-mark {
  color: #67c23a;
  font-weight: bold;
}

.model-card.active:nth-child(2) .check-mark {
  color: #409eff;
}

.custom-settings-modal {
  display: flex;
  flex-direction: column;
  margin-top: 5vh !important;
  max-height: 85vh;
  overflow: hidden;
}

:deep(.el-dialog__body) {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px 20px;
}

.migration-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.migration-item {
  display: flex;
  align-items: center;
  padding: 10px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  background: #fff;
}

.migration-item:hover {
  border-color: #409eff;
  background-color: #ecf5ff;
}

.mig-icon {
  font-size: 20px;
  color: #606266;
  margin-right: 10px;
  display: flex;
  align-items: center;
}

.mig-text {
  display: flex;
  flex-direction: column;
}

.mig-title {
  font-size: 13px;
  font-weight: bold;
  color: #303133;
}

.mig-desc {
  font-size: 11px;
  color: #909399;
}

.migration-uploader {
  width: 100%;
  display: block;
}

.migration-uploader :deep(.el-upload) {
  width: 100%;
  display: block;
}
</style>