import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
// 引入一些基础样式重置
import './style.css'

const app = createApp(App)

app.use(ElementPlus)
app.mount('#app')