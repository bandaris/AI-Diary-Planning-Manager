// electron/main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

// [关键] 设置环境变量

// 1. 日记数据路径：告诉 server/index.js 把日记存到 "文档/DiaryHero" 目录
// 这样卸载软件时，用户的日记不会丢失
process.env.ELECTRON_USER_DATA_PATH = app.getPath('documents');

// 2. 配置数据路径：告诉 server/index.js 把 config.json 存到 "AppData/Roaming/YourApp" 目录
// 这样卸载软件时，配置文件（包含密码）会被系统或卸载程序清理掉
process.env.ELECTRON_APP_CONFIG_PATH = app.getPath('userData');

// 引入并启动你的 Express 后端
// 这样打开软件时，后台服务就自动跑起来了
require('../server/index.js');

function createWindow() {
  const win = new BrowserWindow({
    width: 1288,
    height: 1000,
    title: "记录管家",
    icon: path.join(__dirname, '../public/mini.ico'), 
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // 这里的逻辑是：
  // 1. 后端已经在 3000 端口启动了
  // 2. 后端托管了 dist 文件夹里的前端页面
  // 3. 所以 Electron 只需要加载 localhost:3000 即可
  
  // 等待 1 秒确保 Express 启动
  setTimeout(() => {
    win.loadURL('http://localhost:3000');
  }, 1000);

  // 生产环境隐藏菜单栏 (可选)
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});