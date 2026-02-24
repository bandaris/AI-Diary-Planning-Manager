<template>
  <div class="calendar-container">
    <div class="toolbar">
      <div class="left"><span class="page-title">📅 我的时光记录</span></div>
      <div class="right">
        <el-button type="primary" @click="handleManualCreate">
          <el-icon class="el-icon--left"><EditPen /></el-icon>今日记
        </el-button>
        <div class="divider"></div>
        <el-radio-group v-model="viewRadio">
          <el-radio value="dayGridMonth" size="default" @click="changeView('dayGridMonth')">日历</el-radio>
          <el-radio value="listMonth" size="default" @click="changeView('listMonth')">列表</el-radio>
        </el-radio-group>
      </div>
    </div>

    <FullCalendar 
      ref="fullCalendarRef" 
      :options="calendarOptions" 
      class="calendar-main" 
    />

    <el-dialog v-model="dialogVisible" width="1200px" top="5vh"
      :close-on-click-modal="false" class="diary-dialog">
      
      <template #header>
        <div class="dialog-custom-header">
          <span class="dialog-date-title">{{ formattedSelectDate }}</span>
          <el-tooltip content="标记今天" placement="top" :hide-after="0">
            <el-icon 
              class="star-toggle-btn" 
              :class="{ 'is-active': isStarred }"
              @click="toggleStar"
            >
              <StarFilled v-if="isStarred" />
              <Star v-else />
            </el-icon>
          </el-tooltip>
        </div>
      </template>

      <div class="dialog-layout">
        <div class="left-panel">
          <div class="panel-header">
            <div class="ph-left"><el-icon><Notebook /></el-icon> <span>今日日记</span></div>
            <div class="ph-right">
              <div class="action-pill">
                <template v-if="diaryContent && diaryContent.trim().length > 0">
                  <el-tooltip content="导出为HTML" placement="bottom">
                    <div class="icon-btn" @click="handleExport">
                      <el-icon><Download /></el-icon>
                    </div>
                  </el-tooltip>
                  <el-tooltip content="删除日记" placement="bottom">
                    <div class="icon-btn danger" @click="handleDelete">
                      <el-icon><Delete /></el-icon>
                    </div>
                  </el-tooltip>
                  <div class="divider-line"></div>
                </template>
                <input type="file" ref="fileInputRef" style="display: none" accept=".html,.txt" @change="handleFileImport" />
                <el-tooltip content="支持导入HTML/TXT文件 (智能解析)" placement="bottom">
                  <div class="text-btn" @click="triggerFileInput">
                    <el-icon><Upload /></el-icon>
                    <span>导入</span>
                  </div>
                </el-tooltip>
              </div>
            </div>
          </div>
          
          <div class="editor-wrapper">
            <el-input v-model="diaryContent" type="textarea" placeholder="在此输入日记内容..." resize="none"
              class="diary-editor" />
          </div>
        </div>

        <div class="right-panel">
          <div class="panel-header">
            <el-icon><Timer /></el-icon> <span>行程计划</span>
          </div>
          
          <div class="schedule-list">
            <div v-for="(item, index) in scheduleItems" :key="index" class="schedule-item">
              <el-time-select v-model="item.time" start="06:00" step="00:30" end="23:30" placeholder="时间"
                style="width: 85px; margin-right: 5px;" size="small" :clearable="false" />
              <el-input v-model="item.content" placeholder="事项" size="small" style="flex: 1;" />
              <el-button type="danger" circle size="small" text @click="removeSchedule(index)"
                style="margin-left: 2px;">x</el-button>
            </div>

            <el-button 
              :type="isPastDate ? 'warning' : 'primary'" 
              :plain="!isPastDate"
              class="add-schedule-btn"
              @click="addSchedule"
            >
              <div class="btn-inner">
                <span>{{ isPastDate ? '+ 补录旧时光' : '+ 添加计划' }}</span>
              </div>
            </el-button>

            <div v-if="scheduleItems.length === 0" class="empty-schedule">无行程</div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer-container">
          <div class="footer-left">
            <el-button @click="navigateDate(-1)" link class="nav-date-btn">
              <el-icon><ArrowLeft /></el-icon>
              <span class="nav-text">{{ prevDateLabel }}</span>
            </el-button>
            
            <el-button @click="navigateDate(1)" link class="nav-date-btn">
              <span class="nav-text">{{ nextDateLabel }}</span>
              <el-icon><ArrowRight /></el-icon>
            </el-button>
          </div>
          
          <div class="footer-right">
            <el-button @click="dialogVisible = false" size="large">取消</el-button>
            <el-button type="primary" @click="saveAll(true)" :loading="saving" size="large">完成</el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import FullCalendar from '@fullcalendar/vue3';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import axios from 'axios';
import { ElMessage, ElMessageBox } from 'element-plus';
import { EditPen, Notebook, Timer, Delete, Upload, Download, ArrowLeft, ArrowRight, Star, StarFilled } from '@element-plus/icons-vue';

const fullCalendarRef = ref(null);
const dialogVisible = ref(false);
const selectDate = ref('');
const diaryContent = ref('');
const saving = ref(false);
const events = ref<any[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);
const scheduleItems = ref<any[]>([]);
const viewRadio = ref('dayGridMonth');
const starredSet = ref(new Set<string>());

const formattedSelectDate = computed(() => {
  if (!selectDate.value) return '';
  const [y, m, d] = selectDate.value.split('-');
  return `${y}年${m}月${d}日`;
});

const prevDateLabel = computed(() => {
  if (!selectDate.value) return '';
  const d = new Date(selectDate.value);
  d.setDate(d.getDate() - 1);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
});

const nextDateLabel = computed(() => {
  if (!selectDate.value) return '';
  const d = new Date(selectDate.value);
  d.setDate(d.getDate() + 1);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
});

const isPastDate = computed(() => {
  if (!selectDate.value) return false;
  const today = new Date().toISOString().split('T')[0];
  return selectDate.value < today;
});

const isStarred = computed(() => starredSet.value.has(selectDate.value));

const API_BASE = 'http://localhost:3000/api';

const calendarOptions = reactive({
  plugins: [dayGridPlugin, interactionPlugin, listPlugin],
  initialView: 'dayGridMonth',
  locale: 'zh-cn',
  height: '100%', 
  dayMaxEvents: true, 
  buttonText: { today: '回到本月' },
  noEventsText: '这段时间没有记录呢',
  headerToolbar: { left: 'prevYear,prev', center: 'title', right: 'today,next,nextYear' },
  events: (fetchInfo: any, successCallback: any, failureCallback: any) => {
    successCallback(events.value);
  },
  dateClick: handleDateClick,
  eventClick: handleEventClick,
  displayEventTime: false,
  eventOrder: 'sorter',

  // 【核心修改 1】使用 dayCellClassNames 替代 dayCellDidMount
  // 这里只负责给格子加一个 class，具体的星星由 CSS 伪元素绘制
  dayCellClassNames: (arg: any) => {
    const date = arg.date;
    const offset = date.getTimezoneOffset() * 60000;
    const localDateStr = new Date(date.getTime() - offset).toISOString().split('T')[0];
    
    // 如果该日期在星标集合中，添加 'is-starred-date' 类
    if (starredSet.value.has(localDateStr)) {
      return ['is-starred-date'];
    }
    return [];
  },

  // 列表视图保持原样，因为它本身就是渲染 HTML 字符串，比较稳定
  dayHeaderContent: (arg: any) => {
    if (arg.view.type === 'listMonth') {
      const date = arg.date;
      const offset = date.getTimezoneOffset() * 60000;
      const localDateStr = new Date(date.getTime() - offset).toISOString().split('T')[0];
      if (starredSet.value.has(localDateStr)) {
         return { html: `<span>${arg.text}</span> <span class="calendar-star-icon list-view-star">★</span>` };
      }
    }
    return arg.text;
  }
});

onMounted(() => { fetchEvents(); });

async function fetchEvents() {
  const calendarApi = (fullCalendarRef.value as any)?.getApi();
  const currentViewDate = calendarApi ? calendarApi.getDate() : null;

  const allEvents = [];
  try {
    const [diaryRes, scheduleRes, starRes] = await Promise.all([
      axios.get(`${API_BASE}/diaries`),
      axios.get(`${API_BASE}/schedules/dates`),
      axios.get(`${API_BASE}/starred`)
    ]);

    if (diaryRes.data.success) {
      diaryRes.data.files.forEach((file: string) => {
        allEvents.push({ title: '📝 日记', start: file.replace('.html', ''), color: '#96BB7E', sorter: 1 });
      });
    }
    if (scheduleRes.data.success) {
      scheduleRes.data.dates.forEach((date: string) => {
        allEvents.push({ title: '📅 规划', start: date, color: '#3E6189', sorter: 2 });
      });
    }
    if (starRes.data.success) {
      starredSet.value = new Set(starRes.data.starred);
    }

    events.value = allEvents;
    
    if (calendarApi) {
      calendarApi.refetchEvents(); 
      if (currentViewDate) {
        calendarApi.gotoDate(currentViewDate);
      }
    }
  } catch (e) { console.error('获取数据失败'); }
}

async function toggleStar() {
  if (!selectDate.value) return;
  try {
    const res = await axios.post(`${API_BASE}/star/toggle`, { date: selectDate.value });
    if (res.data.success) {
      starredSet.value = new Set(res.data.starred);
      
      // 星标改变后，render() 会触发 dayCellClassNames 重新计算，类名会自动更新
      const calendarApi = (fullCalendarRef.value as any)?.getApi();
      calendarApi?.render(); 
      
      ElMessage.success(isStarred.value ? '已标记为重要日子' : '已取消标记');
    }
  } catch(e) { ElMessage.error('操作失败'); }
}

async function handleDateClick(arg: any) {
  selectDate.value = arg.dateStr;
  await openDialog();
}

async function handleEventClick(arg: any) {
  selectDate.value = arg.event.startStr;
  await openDialog();
}

async function openDialog() {
  diaryContent.value = '';
  scheduleItems.value = [];
  dialogVisible.value = true;
  await Promise.all([loadDiary(), loadSchedule()]);
}

async function navigateDate(offset: number) {
  if (!selectDate.value) return;
  await saveAll(false); 

  const current = new Date(selectDate.value);
  current.setDate(current.getDate() + offset);
  const year = current.getFullYear();
  const month = String(current.getMonth() + 1).padStart(2, '0');
  const day = String(current.getDate()).padStart(2, '0');
  selectDate.value = `${year}-${month}-${day}`;
  await openDialog();
}

async function loadDiary() {
  try {
    const res = await axios.get(`${API_BASE}/diary/${selectDate.value}.html`);
    if (res.data.success) diaryContent.value = res.data.text;
  } catch (e) { }
}

async function loadSchedule() {
  try {
    const res = await axios.post(`${API_BASE}/schedule/get`, { date: selectDate.value });
    if (res.data.success) scheduleItems.value = res.data.items;
  } catch (e) { scheduleItems.value = []; }
}

function addSchedule() { scheduleItems.value.push({ time: '', content: '' }); }
function removeSchedule(index: number) { scheduleItems.value.splice(index, 1); }

async function saveAll(autoClose = true) {
  if (!selectDate.value) return;
  saving.value = true;
  try {
    const validItems = scheduleItems.value.filter(item => item.content.trim() !== '');
    await Promise.all([
      axios.post(`${API_BASE}/save-diary`, { filename: `${selectDate.value}.html`, content: diaryContent.value || '' }),
      axios.post(`${API_BASE}/schedule/save`, { date: selectDate.value, items: validItems })
    ]);
    
    if (autoClose) {
       ElMessage.success('保存成功！');
       dialogVisible.value = false; 
    }
    
    await fetchEvents(); 
  } catch (e) { ElMessage.error('保存失败'); }
  finally { saving.value = false; }
}

function handleDelete() {
  if (!selectDate.value) return;
  ElMessageBox.confirm('确定要彻底删除这一天的日记吗？', '危险操作', {
    confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning',
  }).then(async () => {
    try {
      const res = await axios.post(`${API_BASE}/delete-diary`, { filename: `${selectDate.value}.html` });
      if (res.data.success) {
        ElMessage.success('日记已删除');
        diaryContent.value = '';
        fetchEvents();
      }
    } catch (e) { ElMessage.error('删除失败'); }
  });
}

function handleExport() {
  if (!selectDate.value) return;
  window.open(`${API_BASE}/download-diary/${selectDate.value}.html`, '_blank');
}

function handleManualCreate() {
  selectDate.value = new Date().toISOString().split('T')[0];
  openDialog();
}

function changeView(view: string) { 
  viewRadio.value = view;
  (fullCalendarRef.value as any)?.getApi()?.changeView(view); 
}

function triggerFileInput() { fileInputRef.value?.click(); }

function handleFileImport(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0];
  if (diaryContent.value && diaryContent.value.length > 10) {
    ElMessageBox.confirm('覆盖现有内容？', '确认', { confirmButtonText: '覆盖', cancelButtonText: '取消' })
      .then(() => readFileContent(file))
      .catch(() => { input.value = ''; });
  } else { readFileContent(file); }
}

function readFileContent(file: File) {
  const reader = new FileReader();
  reader.onload = (e) => {
    if (e.target?.result) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(e.target.result as string, 'text/html');
      let plainText = '';
      const divs = doc.body.querySelectorAll('div');
      if (divs.length > 0) {
        divs.forEach(div => { if (!div.querySelector('div')) plainText += (div.textContent || '') + '\n'; });
      } else { plainText = doc.body.textContent || ''; }
      diaryContent.value = plainText.trim();
      ElMessage.success(`成功导入：${file.name}`);
    }
  };
  reader.readAsText(file, 'utf-8');
}

defineExpose({ fetchEvents });
</script>

<style scoped>
/* 保持原有样式不变 */
.calendar-container { height: 100%; display: flex; flex-direction: column; background: white; }
.toolbar { padding: 15px 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
.page-title { font-size: 18px; font-weight: bold; color: #303133; }
.toolbar .right { display: flex; align-items: center; gap: 12px; gap: 15px; }
.calendar-main { flex: 1; padding: 20px; overflow: hidden; }
.dialog-custom-header { display: flex; align-items: center; gap: 10px; }
.dialog-date-title { font-size: 18px; font-weight: bold; color: #303133; }
.star-toggle-btn { font-size: 20px; cursor: pointer; color: #dcdfe6; transition: color 0.3s; margin-top: -2px; }
.star-toggle-btn:hover { color: #e6a23c; } 
.star-toggle-btn.is-active { color: #f5c518; } 
.dialog-layout { display: flex; height: 600px; border: 1px solid #eee; border-radius: 4px; overflow: hidden; }
.left-panel { flex: 75; border-right: 1px solid #eee; display: flex; flex-direction: column; padding: 20px; box-sizing: border-box; }
.right-panel { flex: 25; display: flex; flex-direction: column; background-color: #fafafa; padding: 15px; box-sizing: border-box; }
.panel-header { height: 30px; font-weight: bold; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; color: #606266; font-size: 16px; }
.ph-left { display: flex; align-items: center; gap: 6px; }
.editor-wrapper { flex: 1; overflow: hidden; position: relative; }
.diary-editor { height: 100%; }
.diary-editor :deep(.el-textarea__inner) { height: 100% !important; font-size: 16px; line-height: 1.8; padding: 15px; }
.schedule-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.schedule-item { display: flex; align-items: center; background: white; padding: 4px; border-radius: 4px; border: 1px solid #eee; }
.empty-schedule { text-align: center; color: #c0c4cc; font-size: 13px; margin-top: 40px; }
.add-schedule-btn { margin-top: 10px; width: 100%; height: 25px; border-style: dashed; transition: all 0.3s; }
.add-schedule-btn.el-button--primary.is-plain { background-color: #505860; border-color: #909399; color: #efefef; }
.dialog-footer-container { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.footer-left { margin-left: 33%; display: flex; gap: 15px; align-items: center; }
.footer-right { display: flex; gap: 12px; }
.el-button--primary { background-color: #505860; border: none; }
.action-pill { display: flex; align-items: center; background-color: #f2f3f5; padding: 4px 6px; border-radius: 20px; gap: 4px; }
.icon-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 50%; cursor: pointer; color: #606266; }
.icon-btn.danger:hover { color: #f56c6c; }
.text-btn { display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 16px; cursor: pointer; color: #606266; font-size: 13px; }
.divider-line { width: 1px; height: 14px; background-color: #dcdfe6; margin: 0 4px; }
.nav-date-btn { color: #909399; font-size: 14px; }
.nav-text { margin: 0 4px; }
.divider { width: 1px; height: 20px; background-color: #dcdfe6; }
:deep(.el-radio-group) { --el-color-primary: #505860; }
:deep(.el-radio.is-checked .el-radio__inner) { background: #505860; border-color: #505860; }
:deep(.el-radio.is-checked .el-radio__label) { color: #505860; }
:deep(.fc-list-day-cushion) { display: flex !important; justify-content: flex-start !important; padding-left: 20px !important; }
:deep(.calendar-star-icon.list-view-star) { margin-left: 8px; vertical-align: middle; }

/* 【核心修改 2】 新增样式 */
/* 使用 ::after 伪元素来绘制月视图的星星 */
/* 这样无论DOM如何刷新，只要 class 存在，CSS 就会绘制星星，解决渲染时机问题 */
:deep(.fc-daygrid-day.is-starred-date .fc-daygrid-day-frame::after) {
  content: '★';
  position: absolute;
  bottom: 4px;
  right: 8px;
  color: #f5c518;
  font-size: 32px;
  line-height: 1;
  z-index: 5;
  pointer-events: none; /* 确保不影响点击事件 */
}
</style>

<style>
/* 全局辅助样式 */
.calendar-star-icon {
  color: #f5c518;
  font-size: 1.1em;
  margin-left: 2px;
  line-height: 1;
}
.calendar-star-icon.list-view-star {
  font-size: 1.2em;
  margin-left: 8px;
  vertical-align: middle;
}
</style>