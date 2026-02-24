// server/index.js
const express = require('express')
const cors = require('cors')
const fs = require('fs-extra')
const path = require('path')
const cheerio = require('cheerio')
const OpenAI = require('openai')
const multer = require('multer')
const archiver = require('archiver') // 新增：用于导出压缩
const AdmZip = require('adm-zip') // 新增：用于导入解压
require('dotenv').config()

const app = express()
const PORT = 3000

// 全局缓存变量
let DIARY_CACHE = null

// --- 全局配置变量 ---
const MAX_HISTORY_DAYS = 60 // 在这里修改历史日记读取天数

app.use(cors())
app.use(express.json())

// --- 路径定义 (核心修改部分) ---

// 1. 数据存储路径 (用于日记、图片、日程等不希望卸载删除的数据)
// 默认指向: 用户文档/DiaryHero
let USER_DATA_PATH
if (process.env.ELECTRON_USER_DATA_PATH) {
  USER_DATA_PATH = path.join(process.env.ELECTRON_USER_DATA_PATH, 'DiaryHero')
} else {
  USER_DATA_PATH = path.join(__dirname, '..')
}

// 2. 配置存储路径 (用于 config.json 等希望卸载即删除的数据)
// 默认指向: AppData/Roaming/YourApp
let APP_CONFIG_PATH
if (process.env.ELECTRON_APP_CONFIG_PATH) {
  APP_CONFIG_PATH = process.env.ELECTRON_APP_CONFIG_PATH
} else {
  // 如果没有环境变量（比如开发模式直接运行 node），则回退到 USER_DATA_PATH
  APP_CONFIG_PATH = USER_DATA_PATH
}

console.log('数据存储路径 (Docs):', USER_DATA_PATH)
console.log('配置存储路径 (AppData):', APP_CONFIG_PATH)

// 定义文件路径
const DIARY_DIR = path.join(USER_DATA_PATH, 'diaries')
const UPLOAD_DIR = path.join(USER_DATA_PATH, 'uploads')

// [关键] 配置文件放在 AppData 下
const CONFIG_FILE = path.join(APP_CONFIG_PATH, 'config.json')

// 其他数据文件放在文档目录下
const SCHEDULE_FILE = path.join(USER_DATA_PATH, 'schedules.json')
const STARRED_FILE = path.join(USER_DATA_PATH, 'starred.json')
const SYSTEM_DOCS_FILE = path.join(USER_DATA_PATH, 'system_docs.json')

// 确保目录存在
fs.ensureDirSync(DIARY_DIR)
fs.ensureDirSync(UPLOAD_DIR)
fs.ensureDirSync(APP_CONFIG_PATH) // 确保配置目录存在

// 初始化配置文件
if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeJsonSync(CONFIG_FILE, {
    userName: '主人',
    aiName: '记录管家',
    userAvatar: '',
    aiAvatar: '',
    personality: '',
    password: '',
    apiKey: '',
    qwenApiKey: '', // 新增
    modelProvider: 'qwen', // 默认设为 qwen
  })
}
if (!fs.existsSync(SCHEDULE_FILE)) fs.writeJsonSync(SCHEDULE_FILE, {})
if (!fs.existsSync(STARRED_FILE)) fs.writeJsonSync(STARRED_FILE, [])

if (!fs.existsSync(SYSTEM_DOCS_FILE)) {
  fs.writeJsonSync(SYSTEM_DOCS_FILE, {
    app: 'DiaryCalendar',
    markers: { green: 'diary', blue: 'schedule', star: 'important' },
    logic: 'auto_save_on_nav',
  })
}

const DIST_DIR = path.join(__dirname, '../dist')
if (fs.existsSync(DIST_DIR)) app.use(express.static(DIST_DIR))
app.use('/uploads', express.static(UPLOAD_DIR))

// --- Multer 配置 ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.mimetype === 'text/html') {
      cb(null, DIARY_DIR)
    } else {
      cb(null, UPLOAD_DIR)
    }
  },
  filename: function (req, file, cb) {
    file.originalname = Buffer.from(file.originalname, 'latin1').toString(
      'utf8',
    )
    if (file.mimetype !== 'text/html') {
      const ext = path.extname(file.originalname)
      cb(null, `avatar_${Date.now()}${ext}`)
    } else {
      cb(null, file.originalname)
    }
  },
})
const upload = multer({ storage: storage })

const HTML_TEMPLATE_START = `<html><head><title>{{TITLE}}</title><basefont face="微软雅黑" size="2" /><meta http-equiv="Content-Type" content="text/html;charset=utf-8" /><meta name="exporter-version" content="DiaryHero Windows/1.0.0 (Win64);"/><style>body, td { font-family: 微软雅黑; font-size: 12pt; }</style></head><body><div><span>`
const HTML_TEMPLATE_END = `</span></div></body></html>`

// --- 辅助函数 ---

function cleanReply(text) {
  if (!text) return ''
  let clean = text
  clean = clean.replace(/~~/g, '')
  clean = clean.replace(/~/g, '～')
  return clean
}

function getBeijingDate() {
  const now = new Date()
  const beijingTimeStr = now.toLocaleString('en-US', {
    timeZone: 'Asia/Shanghai',
  })
  return new Date(beijingTimeStr)
}

// --- 辅助函数 ---

// ... (cleanReply, getBeijingDate 保持不变) ...

// 辅助：生成日期范围内的所有 YYYY-MM-DD
function expandDateRange(startStr, endStr) {
  const dates = []
  const start = new Date(startStr)
  const end = new Date(endStr)

  // 防止日期无效或范围过大（限制最多检索 60 天，防止 token 爆炸）
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return []
  const diffTime = Math.abs(end - start)
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  if (diffDays > 60) {
    console.log(`⚠️ 日期范围过大 (${diffDays}天)，仅取开始和结束日期的月份`)
    // 策略降级：如果范围太大（比如“去年”），只取首尾两个月的每一天，避免卡死
    // 这里简化处理，暂时只返回首尾，或者你可以决定只返回前30天
    return [startStr, endStr]
  }

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${day}`)
  }
  return dates
}

// 【核心修改】利用 AI 智能提取日期
// 参数：text(用户输入), client(AI客户端), modelName(模型名)
async function extractDatesWithAI(text, client, modelName) {
  // 如果文本太短或像问候语，直接跳过，省钱省时间
  if (text.length < 2) return []

  const now = getBeijingDate()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const weekDay = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][
    now.getDay()
  ]

  const prompt = `
  今天是: ${todayStr} (${weekDay})
  用户输入: "${text}"
  
  任务：根据当前时间，分析用户输入提到的时间点或时间段，返回格式示例返回数据
  
  返回格式示例：
  {
    "specific_dates": ["2026-02-09"], 
    "date_ranges": [
       {"start": "2026-01-01", "end": "2026-01-31"} 
    ]
  }
  
  `

  try {
    const completion = await client.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: '你是日期提取器。只返回纯 JSON，严禁 Markdown 格式。',
        },
        { role: 'user', content: prompt },
      ],
      model: modelName,
      temperature: 0.1, // 低温度，保证格式稳定
      response_format: { type: 'json_object' }, // 强制 JSON 模式（部分模型支持，不支持也没事）
    })

    const resultText = completion.choices[0].message.content
    // 清理可能的 markdown 符号
    const cleanJson = resultText
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim()

    const parsed = JSON.parse(cleanJson)
    const finalDates = new Set()

    // 1. 处理具体日期
    if (parsed.specific_dates && Array.isArray(parsed.specific_dates)) {
      parsed.specific_dates.forEach((d) => finalDates.add(d))
    }

    // 2. 处理日期范围
    if (parsed.date_ranges && Array.isArray(parsed.date_ranges)) {
      parsed.date_ranges.forEach((range) => {
        const expanded = expandDateRange(range.start, range.end)
        expanded.forEach((d) => finalDates.add(d))
      })
    }

    const sortedDates = Array.from(finalDates).sort()
    if (sortedDates.length > 0) {
      console.log(`📅 AI 提取到的日期:`, sortedDates)
    }
    return [sortedDates, completion.usage]
  } catch (e) {
    console.error('AI 日期提取失败，回退到正则:', e)
    return []
  }
}

async function getSpecificDiaryContent(dateStr) {
  const filename = `${dateStr}.html`
  const filePath = path.join(DIARY_DIR, filename)
  try {
    if (await fs.pathExists(filePath)) {
      const content = await fs.readFile(filePath, 'utf-8')
      const $ = cheerio.load(content)
      let text = ''
      $('body')
        .find('div')
        .each((i, el) => {
          if ($(el).find('div').length > 0) return
          text += $(el).text() + '\n'
        })
      return `【日期：${dateStr}】\n内容：${text.trim()}\n`
    }
  } catch (e) {}
  return null
}

async function getStarredDates() {
  try {
    if (!(await fs.pathExists(STARRED_FILE))) return []
    const starred = await fs.readJson(STARRED_FILE)
    return starred || []
  } catch (e) {
    return []
  }
}

async function getSystemDocs() {
  try {
    if (!(await fs.pathExists(SYSTEM_DOCS_FILE))) return ''
    const docs = await fs.readJson(SYSTEM_DOCS_FILE)
    return JSON.stringify(docs)
  } catch (e) {
    return ''
  }
}


async function getAllDiariesText(days = MAX_HISTORY_DAYS) {
  // 1. 范围修正：确保不超过全局设定的最大历史天数，也不小于 1
  const targetDays = Math.min(Math.max(days, 1), MAX_HISTORY_DAYS)
  
  // 2. 缓存策略：只有在请求"全量历史"时，才使用或更新全局缓存
  // 如果是请求局部（比如只看最近 7 天），则直接从文件读取，避免污染或依赖全量缓存
  const isFullHistory = targetDays === MAX_HISTORY_DAYS

  if (isFullHistory && DIARY_CACHE !== null) {
    console.log('⚡ 使用日记缓存 (Full Timeline)')
    return DIARY_CACHE
  }

  try {
    console.log(`📅 正在构建时间轴 (最近 ${targetDays} 天)...`)

    // 读取文件列表
    const files = await fs.readdir(DIARY_DIR)
    const fileSet = new Set(files.filter((f) => f.endsWith('.html')))

    const now = getBeijingDate()
    const weeks = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const tasks = []

    const toDateStr = (d) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }

    // 3. 循环变量修改：使用 targetDays 控制循环次数
    for (let i = 0; i < targetDays; i++) {
      const dateObj = new Date(now)
      dateObj.setDate(now.getDate() - i)

      const dateStr = toDateStr(dateObj)
      const fileName = `${dateStr}.html`
      const weekDay = weeks[dateObj.getDay()]

      let timeLabel = ''
      if (i === 0) timeLabel = ' (今天)'
      else if (i === 1) timeLabel = ' (昨天)'
      else if (i === 2) timeLabel = ' (前天)'
      else if (i <= 7) timeLabel = ` (${i}天前)`

      const fullLabel = `${timeLabel} ${weekDay}`

      if (fileSet.has(fileName)) {
        tasks.push(
          (async () => {
            try {
              const content = await fs.readFile(
                path.join(DIARY_DIR, fileName),
                'utf-8',
              )
              const $ = cheerio.load(content)
              let text = ''
              $('body')
                .find('div')
                .each((_, el) => {
                  if ($(el).find('div').length > 0) return
                  $(el).find('br').replaceWith('\n')
                  text += $(el).text() + '\n'
                })
              return `\n【日期: ${dateStr}${fullLabel}】\n内容: ${text.trim()}\n`
            } catch (e) {
              return `\n【日期: ${dateStr}${fullLabel}】\n内容: (读取出错)\n`
            }
          })(),
        )
      } else {
        const placeholder = (async () => {
          let emptyText = '(无记录)'
          return `\n【日期: ${dateStr}${fullLabel}】\n内容: ${emptyText}\n`
        })()
        tasks.push(placeholder)
      }
    }

    const results = await Promise.all(tasks)
    const finalContext = results.join('')

    // 4. 只有全量请求时，才写入缓存
    if (isFullHistory) {
      DIARY_CACHE = finalContext
      console.log('📅 全量缓存已更新')
    } else {
      console.log(`📅 局部提取完成 (${targetDays}天)`)
    }

    return finalContext
  } catch (e) {
    console.error('构建时间轴失败:', e)
    return ''
  }
}
async function getScheduleSummary() {
  try {
    if (!(await fs.pathExists(SCHEDULE_FILE)))
      return { todayPast: '无', todayFuture: '无', upcoming: '无' }
    const data = await fs.readJson(SCHEDULE_FILE)
    const now = getBeijingDate()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const todayKey = `${year}-${month}-${day}`
    
    // --- 新增：计算一个月后的截止日期 ---
    const nextMonthDate = new Date(now)
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1)
    const y2 = nextMonthDate.getFullYear()
    const m2 = String(nextMonthDate.getMonth() + 1).padStart(2, '0')
    const d2 = String(nextMonthDate.getDate()).padStart(2, '0')
    const maxDateKey = `${y2}-${m2}-${d2}`
    // ----------------------------------

    const currentTime = now.toLocaleTimeString('en-GB', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Shanghai',
    })
    const todayItems = data[todayKey] || []
    let todayPast = []
    let todayFuture = []
    todayItems.forEach((item) => {
      if (item.time < currentTime) {
        todayPast.push(`${item.time} ${item.content}`)
      } else {
        todayFuture.push(`${item.time} ${item.content}`)
      }
    })
    let upcoming = []
    const allDates = Object.keys(data).sort()
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    
    for (const dateStr of allDates) {
      // --- 修改：增加 && dateStr <= maxDateKey 判断 ---
      if (dateStr > todayKey && dateStr <= maxDateKey) {
        const items = data[dateStr]
        if (items && items.length > 0) {
          const targetDate = new Date(dateStr)
          const todayDateObj = new Date(todayKey)
          const diffTime = Math.abs(targetDate - todayDateObj)
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
          let dayLabel = ''
          if (diffDays === 1) dayLabel = '明天'
          else if (diffDays === 2) dayLabel = '后天'
          else {
            dayLabel = `${diffDays}天后`
          }
          // 注意：new Date(dateStr) 默认是UTC，算星期几可能偏差，建议补全时间或手动计算，
          // 但沿用你原有逻辑这里暂时不动，仅做日期范围过滤。
          const weekDayStr = weekDays[new Date(dateStr).getUTCDay()]
          const contentStr = items
            .map((i) => `${i.time} ${i.content}`)
            .join('; ')
          upcoming.push(
            `【${dateStr} (${dayLabel}, ${weekDayStr})】: ${contentStr}`,
          )
        }
      }
    }
    return {
      todayPast: todayPast.length > 0 ? todayPast.join('; ') : '无',
      todayFuture: todayFuture.length > 0 ? todayFuture.join('; ') : '无',
      upcoming:
        upcoming.slice(0, 10).length > 0
          ? upcoming.slice(0, 10).join('\n')
          : '近期无安排', // 修改文案，既然限制了时间，这里叫"近期无安排"更合适
    }
  } catch (e) {
    return {
      todayPast: '读取错误',
      todayFuture: '读取错误',
      upcoming: '读取错误',
    }
  }
}

function getTimePeriod() {
  const now = getBeijingDate()
  const hour = now.getHours()
  if (hour < 6) return '凌晨'
  if (hour < 9) return '早上'
  if (hour < 12) return '上午'
  if (hour < 14) return '中午'
  if (hour < 18) return '下午'
  return '晚上'
}

// --- 核心：获取 AI Client 和模型名称 ---
function getAIClient(config) {
  if (config.modelProvider === 'qwen') {
    // 使用 SiliconFlow 提供的 Qwen 免费服务
    return {
      client: new OpenAI({
        baseURL: 'https://api.siliconflow.cn/v1',
        apiKey: config.qwenApiKey,
      }),
      modelName: 'Qwen/Qwen3-8B',
      providerName: 'SiliconFlow (Qwen)',
    }
  } else {
    // 默认为 DeepSeek
    return {
      client: new OpenAI({
        baseURL: 'https://api.deepseek.com',
        apiKey: config.apiKey,
      }),
      modelName: 'deepseek-chat',
      providerName: 'DeepSeek',
    }
  }
}

// ================= API 接口 =================

app.get('/api/config', async (req, res) => {
  try {
    const config = await fs.readJson(CONFIG_FILE)
    res.json({ success: true, config })
  } catch (error) {
    res.json({ success: false })
  }
})
app.post('/api/config', async (req, res) => {
  try {
    await fs.writeJson(CONFIG_FILE, req.body)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ success: false })
  }
})
app.post('/api/login', async (req, res) => {
  try {
    const { password } = req.body
    const config = await fs.readJson(CONFIG_FILE)
    if (!config.password) return res.json({ success: true })
    if (config.password === password) return res.json({ success: true })
    res.json({ success: false })
  } catch (error) {
    res.status(500).json({ success: false })
  }
})
app.post('/api/upload-avatar', upload.single('avatar'), (req, res) => {
  if (req.file) {
    const fileUrl = `http://localhost:${PORT}/uploads/${req.file.filename}`
    res.json({ success: true, url: fileUrl })
  } else {
    res.status(400).json({ success: false })
  }
})
app.get('/api/diaries', async (req, res) => {
  try {
    const files = await fs.readdir(DIARY_DIR)
    const diaryFiles = files.filter((file) => file.endsWith('.html'))
    res.json({ success: true, files: diaryFiles })
  } catch (error) {
    res.status(500).json({ success: false })
  }
})

app.get('/api/diary/:filename', async (req, res) => {
  try {
    const filename = req.params.filename
    const filePath = path.join(DIARY_DIR, filename)
    if (!(await fs.pathExists(filePath)))
      return res.status(404).json({ success: false })
    const htmlContent = await fs.readFile(filePath, 'utf-8')
    const $ = cheerio.load(htmlContent)
    let rawText = ''
    const divs = $('body').find('div')
    if (divs.length > 0) {
      divs.each((i, el) => {
        if ($(el).find('div').length > 0) return
        $(el).find('br').replaceWith('\n')
        rawText += $(el).text() + '\n'
      })
    } else {
      rawText = $('body').text()
    }
    res.json({ success: true, html: htmlContent, text: rawText.trim() })
  } catch (error) {
    res.status(500).json({ success: false })
  }
})

app.post('/api/upload', upload.single('diary'), async (req, res) => {
  res.json({ success: true })
})
app.post('/api/check-exist', async (req, res) => {
  try {
    const { filename } = req.body
    const exists = await fs.pathExists(path.join(DIARY_DIR, filename))
    res.json({ success: true, exists })
  } catch (error) {
    res.status(500).json({ success: false })
  }
})

app.post('/api/save-diary', async (req, res) => {
  try {
    const { filename, content } = req.body
    const filePath = path.join(DIARY_DIR, filename)
    if (!content || content.trim() === '') {
      if (await fs.pathExists(filePath)) {
        await fs.unlink(filePath)
      }
      return res.json({ success: true, message: '日记内容为空，已清除记录' })
    }
    const lines = content.split('\n')
    let htmlBodyContent = ''
    lines.forEach((line) => {
      if (line.trim()) {
        htmlBodyContent += `<div>${line}</div>`
      } else {
        htmlBodyContent += `<div><br/></div>`
      }
    })
    const title = filename.replace('.html', '')
    const header = HTML_TEMPLATE_START.replace('{{TITLE}}', title)
    const fullHtml = header + htmlBodyContent + HTML_TEMPLATE_END
    await fs.writeFile(filePath, fullHtml, 'utf-8')
    DIARY_CACHE = null
    console.log('🔄 日记已更新，缓存已清除')
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ success: false })
  }
})

// 【核心修改】：Chat 接口，支持动态模型切换
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body
    let config = {}
    try {
      config = await fs.readJson(CONFIG_FILE)
    } catch (e) {}

    // 获取 AI 客户端和模型名称
    const { client, modelName, providerName } = getAIClient(config)

    console.log(`🤖 正在使用模型: ${providerName} (${modelName})`)

    if (!config.apiKey && !config.qwenApiKey)
      return res.json({ success: true, reply: `请先在设置中配置 API Key` })

    const diaryContext = await getAllDiariesText()
    const scheduleData = await getScheduleSummary()
    const starredList = await getStarredDates()
    const systemDocs = await getSystemDocs()

    let mentionedDates = []
    let extractDatesUsage = {}
    try {
      extractDatesWithAIRes = await extractDatesWithAI(
        message,
        client,
        modelName,
      )
      mentionedDates = extractDatesWithAIRes[0]
      extractDatesUsage = extractDatesWithAIRes[1]
    } catch (err) {
      console.log('日期提取出错，跳过', err)
    }
    let specificDiariesText = ''
    if (mentionedDates.length > 0) {
      console.log('🔍 用户提及日期:', mentionedDates)
      for (const date of mentionedDates) {
        const content = await getSpecificDiaryContent(date)
        if (content) specificDiariesText += content
      }
    }

    const timePeriod = getTimePeriod()
    const now = getBeijingDate()
    const toISODate = (date) => {
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
    const today = toISODate(now)
    const currentTime = now.toLocaleTimeString('en-GB', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Shanghai',
    })

    const systemPrompt = `
        【绝对规则】
        1. 只读权限，引导用户操作。
        2. 禁止删除线。

        【软件功能认知】
        ${systemDocs}

        【角色设定】
        名字：${config.aiName}
        性格：${config.personality || '随机'}
        用户：${config.userName}
        当前大脑：${providerName}
        
        【重要：核心数据库：用户的日记】：${specificDiariesText ? specificDiariesText : diaryContext}

        【星标日期】
        ${starredList.length > 0 ? starredList.join(', ') : '空'}

        ========== (以上为静态缓存区) ==========

       【用户待办事项】
        待办(今日)：${scheduleData.todayFuture}
        待办(未来)：${scheduleData.upcoming}


        【当前日期】
        ${today} (${timePeriod})

        【当前时间】
        ${currentTime}

        【重要回复规则】
        1. 核心数据库中的日记都标记了具体的日期结合【当前日期】和【当前时间】，若日记内容: (无记录)，则根据性格回复用户没有找到日记内容。
        2. 核心数据库如果有数据，则根据日记内容回复用户问题。
        3. 回复待办事项必须严格比对【当前日期】【当前时间】。
        4. 回复待办事项必须告知待办的具体日期和时间。
        
        
        【任务】
        严格遵循性格、少说废话、非必要详情需控制在150字以内，详情回复则控制在400字以内，注意换行，排版和格式。
    `
    const apiMessages = [{ role: 'system', content: systemPrompt }]

    console.log(723,'=====>',systemPrompt);
    if (history && Array.isArray(history)) {
      history.forEach((h) => {
        if (h.role && h.content) {
          apiMessages.push({ role: h.role, content: h.content })
        }
      })
    }

    apiMessages.push({ role: 'user', content: message })

    const completion = await client.chat.completions.create({
      messages: apiMessages,
      model: modelName,
    })

    const cleanContent = cleanReply(completion.choices[0].message.content)
    const allUsage = {
      prompt_tokens: (completion?.usage?.prompt_tokens || 0) + (extractDatesUsage?.prompt_tokens || 0),
      prompt_cache_hit_tokens: (completion?.usage?.prompt_cache_hit_tokens || 0) + (extractDatesUsage?.prompt_cache_hit_tokens || 0),
      prompt_cache_miss_tokens:(completion?.usage?.prompt_cache_miss_tokens || 0) + (extractDatesUsage?.prompt_cache_miss_tokens || 0),
      completion_tokens: (completion?.usage?.completion_tokens || 0) + (extractDatesUsage?.completion_tokens || 0),
      total_tokens: (completion?.usage?.total_tokens || 0) + (extractDatesUsage?.total_tokens || 0),
      completion_tokens_details: completion?.usage?.completion_tokens_details,
    }
    res.json({
      success: true,
      reply: cleanContent,
      usage: allUsage,
      dates:mentionedDates
    })
  } catch (error) {
    console.error('Chat error:', error)
    if (error.status === 401)
      return res.json({ success: true, reply: `Key 似乎无效，请检查配置...` })
    res.status(500).json({ success: false })
  }
})

app.get('/api/greeting', async (req, res) => {
  try {
    let config = {}
    try {
      config = await fs.readJson(CONFIG_FILE)
    } catch (e) {}

    // 同样应用动态客户端逻辑
    const { client, modelName } = getAIClient(config)

    // 只要有任意一个 Key 存在即可尝试问候
    if (!config.apiKey && !config.qwenApiKey)
      return res.json({ success: true, reply: '主人欢迎回来~' })

    const diaryContext = await getAllDiariesText(7)
    const scheduleData = await getScheduleSummary()
    const starredList = await getStarredDates()
    const systemDocs = await getSystemDocs()

    const timePeriod = getTimePeriod()
    const now = getBeijingDate()
    const toISODate = (date) => {
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
    const today = toISODate(now)
    const currentTime = now.toLocaleTimeString('en-GB', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Shanghai',
    })

    const systemPrompt = `
        【绝对规则】
        1. 仅聊天权限，无任何额外帮用户操作的功能。
        2. 禁止删除线。

        【角色设定】
        名字：${config.aiName}
        性格：${config.personality || '随机'}
        用户：${config.userName}

        【软件功能认知】
        ${systemDocs}

        【重要：核心数据库：用户最近7天的日记】：${diaryContext}

        【星标日期】
        ${starredList.length > 0 ? starredList.join(', ') : '无'}

        ========== (以上为静态缓存区) ==========

        【用户待办事项】
        待办(今日)：${scheduleData.todayFuture}
        待办(未来)：${scheduleData.upcoming}

        【当前日期】
        ${today} (${timePeriod})

        【当前时间】
        ${currentTime}

        【任务】
        给用户生成80字以内的问候语。

        【要求】
        1. 根据【当前日期】【当前时间】【用户待办事项】提示用户。
        2. 必须提及最近一周的日记内容（除非一周内没有日记），若日记（无记录）不可瞎编。
        3. 绝对严禁使用具体的时间代词：昨天、前天、n天前，只可使用模糊的时间代词。
        4. 严格遵循性格，严格比对时间，少说废话，不可以推测日记内容: (无记录)做了什么。
 
    `
    const completion = await client.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Greeting' },
      ],
      model: modelName,
    })

    const cleanContent = cleanReply(completion.choices[0].message.content)
    res.json({ success: true, reply: cleanContent })
  } catch (e) {
    console.error('Greeting error:', e)
    res.status(500).json({ success: false })
  }
})

app.post('/api/schedule/get', async (req, res) => {
  try {
    const { date } = req.body
    const data = await fs.readJson(SCHEDULE_FILE)
    const items = data[date] || []
    res.json({ success: true, items })
  } catch (error) {
    res.json({ success: true, items: [] })
  }
})
app.post('/api/schedule/save', async (req, res) => {
  try {
    const { date, items } = req.body
    const data = await fs.readJson(SCHEDULE_FILE)
    data[date] = items
    await fs.writeJson(SCHEDULE_FILE, data)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ success: false })
  }
})
app.get('/api/schedules/dates', async (req, res) => {
  try {
    if (!(await fs.pathExists(SCHEDULE_FILE)))
      return res.json({ success: true, dates: [] })
    const data = await fs.readJson(SCHEDULE_FILE)
    const dates = Object.keys(data).filter(
      (date) => data[date] && data[date].length > 0,
    )
    res.json({ success: true, dates })
  } catch (error) {
    res.status(500).json({ success: false })
  }
})
app.get('/api/starred', async (req, res) => {
  try {
    if (!(await fs.pathExists(STARRED_FILE)))
      return res.json({ success: true, starred: [] })
    const starred = await fs.readJson(STARRED_FILE)
    res.json({ success: true, starred })
  } catch (error) {
    res.status(500).json({ success: false })
  }
})
app.post('/api/star/toggle', async (req, res) => {
  try {
    const { date } = req.body
    let starred = []
    if (await fs.pathExists(STARRED_FILE)) {
      starred = await fs.readJson(STARRED_FILE)
    }
    if (starred.includes(date)) {
      starred = starred.filter((d) => d !== date)
    } else {
      starred.push(date)
    }
    await fs.writeJson(STARRED_FILE, starred)
    res.json({ success: true, starred })
  } catch (error) {
    res.status(500).json({ success: false })
  }
})
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads'))
    return next()
  if (fs.existsSync(path.join(DIST_DIR, 'index.html')))
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  else next()
})
app.post('/api/delete-diary', async (req, res) => {
  try {
    const { filename } = req.body
    const filePath = path.join(DIARY_DIR, filename)
    if (await fs.pathExists(filePath)) {
      await fs.unlink(filePath)
      DIARY_CACHE = null
      console.log(`🗑️ 日记已删除: ${filename}`)
      res.json({ success: true, message: '删除成功' })
    } else {
      res.json({ success: false, message: '文件不存在' })
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败' })
  }
})
app.get('/api/download-diary/:filename', async (req, res) => {
  try {
    const filename = req.params.filename
    const filePath = path.join(DIARY_DIR, filename)
    if (await fs.pathExists(filePath)) {
      let content = await fs.readFile(filePath, 'utf-8')
      const title = filename.replace('.html', '')
      content = content.replace(
        /<title>.*?<\/title>/,
        `<title>${title}</title>`,
      )
      res.attachment(filename)
      res.send(content)
    } else {
      res.status(404).send('文件不存在')
    }
  } catch (error) {
    res.status(500).send('下载出错')
  }
})

// --- 新增：导出数据 API ---
app.get('/api/export-data', async (req, res) => {
  try {
    const archive = archiver('zip', { zlib: { level: 9 } })
    const filename = `数据备份_${new Date().toISOString().slice(0, 10)}（无需解压）.zip`

    res.attachment(filename)
    archive.pipe(res)

    // 添加文件夹
    archive.directory(DIARY_DIR, 'diaries')
    archive.directory(UPLOAD_DIR, 'uploads')

    // 添加关键 JSON 文件
    if (fs.existsSync(SCHEDULE_FILE))
      archive.file(SCHEDULE_FILE, { name: 'schedules.json' })
    if (fs.existsSync(STARRED_FILE))
      archive.file(STARRED_FILE, { name: 'starred.json' })
    if (fs.existsSync(CONFIG_FILE))
      archive.file(CONFIG_FILE, { name: 'config.json' })

    archive.finalize()
  } catch (e) {
    console.error('Export error:', e)
    res.status(500).send('Export failed')
  }
})

// --- 新增：导入数据 API ---
app.post('/api/import-data', upload.single('file'), async (req, res) => {
  try {
    if (!req.file)
      return res.json({ success: false, message: 'No file uploaded' })

    const zip = new AdmZip(req.file.path)
    // 创建临时解压目录
    const tempDir = path.join(USER_DATA_PATH, 'temp_import')
    fs.ensureDirSync(tempDir)

    // 解压所有文件到临时目录
    zip.extractAllTo(tempDir, true)

    // 覆盖文件逻辑
    // 1. 日记
    if (fs.existsSync(path.join(tempDir, 'diaries'))) {
      fs.copySync(path.join(tempDir, 'diaries'), DIARY_DIR, { overwrite: true })
    }
    // 2. 上传的图片等资源
    if (fs.existsSync(path.join(tempDir, 'uploads'))) {
      fs.copySync(path.join(tempDir, 'uploads'), UPLOAD_DIR, {
        overwrite: true,
      })
    }
    // 3. JSON 数据文件
    if (fs.existsSync(path.join(tempDir, 'schedules.json'))) {
      fs.copySync(path.join(tempDir, 'schedules.json'), SCHEDULE_FILE, {
        overwrite: true,
      })
    }
    if (fs.existsSync(path.join(tempDir, 'starred.json'))) {
      fs.copySync(path.join(tempDir, 'starred.json'), STARRED_FILE, {
        overwrite: true,
      })
    }
    if (fs.existsSync(path.join(tempDir, 'config.json'))) {
      fs.copySync(path.join(tempDir, 'config.json'), CONFIG_FILE, {
        overwrite: true,
      })
    }

    // 清理临时文件和上传的 zip
    fs.removeSync(tempDir)
    fs.unlinkSync(req.file.path)

    // 清除内存缓存，强制下次重新读取
    DIARY_CACHE = null

    res.json({ success: true, message: 'Migration successful' })
  } catch (e) {
    console.error('Import error:', e)
    res.json({ success: false, message: 'Import failed' })
  }
})

app.listen(PORT, () => {
  console.log(`服务启动: http://localhost:${PORT}`)
})
