<template>
  <div class="app-container" v-if="isInitFinish">
    <div v-if="locked" class="login-overlay">
      <div class="login-box">
        <h2>🔒 私人记录管家</h2>
        <p>请输入密码解锁您的专属记录</p>
        <el-input 
          v-model="passwordInput" 
          type="password" 
          placeholder="请输入密码" 
          show-password
          @keyup.enter="handleLogin"
        >
          <template #append>
            <el-button @click="handleLogin">解锁</el-button>
          </template>
        </el-input>
        <div class="error-msg" v-if="errorMsg">{{ errorMsg }}</div>
      </div>
    </div>

    <div v-else class="main-layout">
  <div class="left-panel">
    <DiaryCalendar ref="diaryCalendarRef" />
  </div>
  <div class="right-panel">
    <ChatBox @data-restored="handleRefreshData" />
  </div>
</div>
  </div>
  <div v-else>
    加载中……
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';
import DiaryCalendar from './components/DiaryCalendar.vue';
import ChatBox from './components/ChatBox.vue';

// 状态控制
const isInitFinish = ref(false)
const locked = ref(true); // 默认先锁住，等查完配置再说
const passwordInput = ref('');
const errorMsg = ref('');
const diaryCalendarRef = ref(null);

onMounted(async () => {
  await checkLockStatus();
});

// 【新增】处理刷新逻辑
const handleRefreshData = () => {
  console.log('收到刷新信号，正在更新日历...');
  if (diaryCalendarRef.value) {
    // 调用 DiaryCalendar 暴露出来的 fetchEvents 方法
    (diaryCalendarRef.value as any).fetchEvents();
  }
};

// 检查是否需要锁屏
const checkLockStatus = async () => {
  try {
    const res = await axios.get('http://localhost:3000/api/config');
    if (res.data.success) {
      const config = res.data.config;
      // 如果配置了密码，保持锁定；如果没有密码，直接解锁
      if (config.password && config.password.trim() !== '') {
        locked.value = true;
      } else {
        locked.value = false;
      }
    }
  } catch (e) {
    // 如果连不上后端，默认解锁或者报错，这里为了体验先解锁
    locked.value = false;
  }
  isInitFinish.value = true
};

// 处理登录解锁
const handleLogin = async () => {
  if (!passwordInput.value) return;
  
  try {
    const res = await axios.post('http://localhost:3000/api/login', {
      password: passwordInput.value
    });
    
    if (res.data.success) {
      locked.value = false; // 解锁成功，进入主界面
      errorMsg.value = '';
    } else {
      errorMsg.value = '密码错误，请重试';
    }
  } catch (e) {
    errorMsg.value = '验证出错';
  }
};
</script>

<style>
/* 全局重置 */
html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
  overflow: hidden;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑', Arial, sans-serif;
}

.app-container {
  height: 100%;
  width: 100%;
}

/* 登录层样式 */
.login-overlay {
  height: 100%;
  width: 100%;
  background-color: #2c3e50;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-box {
  background: white;
  padding: 40px;
  border-radius: 12px;
  width: 350px;
  text-align: center;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.login-box h2 { margin-top: 0; color: #333; }
.login-box p { color: #666; margin-bottom: 20px; font-size: 14px; }
.error-msg { color: #f56c6c; font-size: 12px; margin-top: 10px; }

/* 主界面布局 */
.main-layout {
  display: flex;
  height: 100%;
  width: 100%;
}

.left-panel {
  flex: 2; /* 左侧占 2/3 */
  border-right: 1px solid #ddd;
  overflow: hidden;
}

.right-panel {
  flex: 1; /* 右侧占 1/3 */
  overflow: hidden;
}
</style>