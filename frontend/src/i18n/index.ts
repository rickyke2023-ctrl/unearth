export type Language = 'zh' | 'en'

// ── Static translation map ─────────────────────────────────────────────────

const translations: Record<string, { zh: string; en: string }> = {
  // ── App / StrataView ────────────────────────────────────────────────────
  'app.subtitle':             { zh: 'A Memory Excavation',   en: 'A Memory Excavation' },
  'excavation.button':        { zh: '今日发掘',               en: "Today's Excavation" },
  'strata.loading':           { zh: '加载地层中…',            en: 'Loading strata…' },
  'strata.error.title':       { zh: '加载失败',               en: 'Failed to load' },
  'stats.carried':            { zh: '带走',                  en: 'Carried' },
  'stats.left':               { zh: '留下',                  en: 'Left' },
  'stats.freed':              { zh: '已释放',                 en: 'Freed' },
  'stats.progress':           { zh: '进度',                  en: 'Progress' },
  'stats.pending':            { zh: '待确认',                 en: 'Pending' },
  'stats.trash':              { zh: '回收站',                 en: 'Trash' },
  'nav.back.strata':          { zh: '← 地层',                en: '← Strata' },
  // month tooltip
  'month.tooltip.photos':     { zh: '张',                    en: 'photos' },
  'month.tooltip.events':     { zh: '个事件',                 en: 'events' },

  // ── SiteView ────────────────────────────────────────────────────────────
  'site.events.count':        { zh: '个拍摄事件',             en: 'shooting events' },
  'site.burst':               { zh: '连拍',                  en: 'burst' },
  'site.photo.single':        { zh: '1 张',                  en: '1 photo' },
  'site.empty':               { zh: '这个月没有拍摄记录',      en: 'No photos this month' },
  'site.loading':             { zh: '加载拍摄事件…',          en: 'Loading events…' },
  'site.error':               { zh: '加载失败',               en: 'Failed to load' },

  // ── DecisionView navigation ─────────────────────────────────────────────
  'decision.back':            { zh: '← 返回',                en: '← Back' },
  'decision.group.of':        { zh: '组 / 共',               en: 'of' },   // "第 N 组 / 共 M 组"
  'decision.group.prefix':    { zh: '第',                    en: 'Group' },
  'decision.burst.label':     { zh: '连拍',                  en: 'burst' },
  'decision.book.badge':      { zh: '★ 书候选',              en: '★ Pick' },
  'decision.undo':            { zh: '撤销 Z',                en: 'Undo Z' },
  'decision.lightbox.hint':   { zh: '按 Space 或点击背景关闭', en: 'Press Space or click to close' },
  'decision.paired.raw':      { zh: '此照片有配套 RAW 文件',   en: 'This photo has a paired RAW file' },
  'decision.paired.jpeg':     { zh: '此照片有配套 JPEG 文件',  en: 'This photo has a paired JPEG file' },
  'decision.preview.gen':     { zh: '预览图生成中',            en: 'Preview generating' },
  'decision.capsule.unit':    { zh: '段记忆',                 en: 'memories' },
  'decision.day.count':       { zh: '今天拍了',               en: '' },       // used inline
  'decision.day.count.unit':  { zh: '张',                    en: 'photos taken this day' },
  'decision.processed':       { zh: '已处理',                 en: 'Processed' },
  'decision.freed':           { zh: '释放',                  en: 'Freed' },

  // ── Decision buttons ────────────────────────────────────────────────────
  'btn.leave':                { zh: '留在这里',               en: 'Leave here' },
  'btn.leave.active':         { zh: '留在这片土地上',          en: 'Leave it to the land' },
  'btn.skip':                 { zh: '稍后',                  en: 'Later' },
  'btn.keep':                 { zh: '带走',                  en: 'Keep' },
  'btn.keep.active':          { zh: '带入行囊',               en: 'Into the pack' },

  // ── AllDoneState ────────────────────────────────────────────────────────
  'done.group.title':         { zh: '这一组挖完了',            en: 'This group is done' },
  'done.group.carried':       { zh: '带走了',                 en: 'Carried' },
  'done.group.memories':      { zh: '段记忆',                 en: 'memories' },
  'done.group.left':          { zh: '留下',                  en: 'Left' },
  'done.group.freed':         { zh: '释放了',                 en: 'Freed' },
  'done.back.list':           { zh: '← 返回列表',             en: '← Back to list' },
  'done.next.group':          { zh: '下一组 →',               en: 'Next group →' },
  'done.all.month':           { zh: '本月已全部完成',          en: 'All done this month' },

  // ── ExcavationView ──────────────────────────────────────────────────────
  'excav.header':             { zh: '今日发掘',               en: "Today's Excavation" },
  'excav.back':               { zh: '← 返回',                en: '← Back' },
  'excav.empty':              { zh: '今天没有可出土的记忆',     en: 'Nothing to unearth today' },
  'excav.error':              { zh: '加载失败',               en: 'Failed to load' },
  'excav.done.title':         { zh: '今日发掘完成',            en: "Today's Excavation Complete" },
  'excav.done.kept':          { zh: '带走',                  en: 'Carried' },
  'excav.done.left':          { zh: '留下',                  en: 'Left' },
  'excav.done.total':         { zh: '已出土',                 en: 'Unearthed' },
  'excav.done.poem':          { zh: '明天的地层还在等待。\n每一天，二十个瞬间。',
                                en: "Tomorrow's strata still wait.\nTwenty moments, every day." },
  'excav.done.back':          { zh: '← 回到地层',             en: '← Back to Strata' },
  'excav.hint':               { zh: '拨开表土，取出记忆',       en: 'Brush away the earth, unearth the memory' },

  // ── KeptView ────────────────────────────────────────────────────────────
  'kept.title':               { zh: '带走的记忆',             en: 'Memories Carried Forward' },
  'kept.nav.strata':          { zh: '← 地层',                en: '← Strata' },
  'kept.stats.unit':          { zh: '张带走',                 en: 'carried forward' },
  'kept.year.all':            { zh: '全部',                  en: 'All' },
  'kept.empty.title':         { zh: '行囊还是空的',            en: 'Your pack is still empty' },
  'kept.empty.hint':          { zh: '开始挖掘，把值得带走的记忆放进来。',
                                en: 'Start excavating. Bring forward what\'s worth carrying.' },
  'kept.empty.back':          { zh: '← 回到地层',             en: '← Back to Strata' },
  'kept.error':               { zh: '加载失败',               en: 'Failed to load' },

  // ── StoryView ────────────────────────────────────────────────────────────
  'story.title':                   { zh: '故事',                    en: 'Stories' },
  'story.tab.today':               { zh: '今日故事',                en: "Today's Story" },
  'story.tab.places':              { zh: '地方',                   en: 'Places' },
  'story.today.label':             { zh: '这一天',                  en: 'This Day' },
  'story.today.empty.title':       { zh: '今天这一天，还没有照片',     en: 'No photos found for this day' },
  'story.today.empty.hint':        { zh: '继续挖掘，随着时间积累，今天的故事会显现。',
                                     en: 'Keep excavating. Stories surface over time.' },
  'story.time.morning':            { zh: '晨',                     en: 'morning' },
  'story.time.afternoon':          { zh: '午',                     en: 'afternoon' },
  'story.time.evening':            { zh: '暮',                     en: 'evening' },
  'story.time.night':              { zh: '夜',                     en: 'night' },
  'story.showing':                 { zh: '显示',                   en: 'Showing' },
  'story.places.label':            { zh: '地方',                   en: 'Places' },
  'story.places.gps_count':        { zh: '张照片有位置',             en: 'photos with location' },
  'story.places.no_gps':           { zh: '张暂无',                  en: 'without location' },
  'story.places.photo_count_unit': { zh: '张',                     en: 'photos' },
  'story.places.empty.title':      { zh: '还没有地方',              en: 'No places yet' },
  'story.places.empty.hint':       { zh: '地方故事需要 GPS 数据。运行 GPS 地理编码后，你去过的地方会在这里显现。',
                                     en: 'Place stories need GPS data. Run geocoding and the places you\'ve been will appear here.' },
  'story.error':                   { zh: '加载失败',                en: 'Failed to load' },
  // entry button on StrataView
  'story.button':                  { zh: '故事',                   en: 'Stories' },

  // ── BookView ─────────────────────────────────────────────────────────────
  'book.title':               { zh: '精选册候选',              en: 'Book Picks' },
  'book.nav.strata':          { zh: '← 地层',                 en: '← Strata' },
  'book.stats.unit':          { zh: '张精选',                  en: 'picks' },
  'book.empty.title':         { zh: '还没有精选',              en: 'No picks yet' },
  'book.empty.hint':          { zh: '决策时点击「★ 精选」，精选照片会出现在这里',
                                en: 'Mark photos as "★ Pick" during review — they\'ll appear here' },
  'book.empty.back':          { zh: '← 回到地层',              en: '← Back to Strata' },
  'book.export.btn':          { zh: '导出清单',                en: 'Export list' },
  'book.button':              { zh: '精选册',                  en: 'Book Picks' },

  // ── AlmanacView ───────────────────────────────────────────────────────────
  'almanac.title':            { zh: '年历',                   en: 'Almanac' },
  'almanac.button':           { zh: '年历',                   en: 'Almanac' },
  'almanac.nav.strata':       { zh: '← 地层',                 en: '← Strata' },
  'almanac.tab.calendar':     { zh: '拍摄日历',                en: 'Photo Calendar' },
  'almanac.tab.time':         { zh: '时段分布',                en: 'Time of Day' },
  'almanac.cal.tooltip.photos':  { zh: '张', en: 'photos' },
  'almanac.cal.tooltip.decided': { zh: '已决', en: 'decided' },
  'almanac.cal.tooltip.kept':    { zh: '带走', en: 'kept' },
  'almanac.cal.no_photos':    { zh: '无拍摄',                  en: 'No photos' },
  'almanac.time.peak':        { zh: '最多',                   en: 'Peak' },
  'almanac.time.total':       { zh: '共',                     en: 'Total' },
  'almanac.error':            { zh: '加载失败',                en: 'Failed to load' },

  // ── MilestoneOverlay ────────────────────────────────────────────────────
  'milestone.continue':       { zh: '按任意键继续',            en: 'Press any key to continue' },

  // ── StagingConfirmDialog ────────────────────────────────────────────────
  'staging.title':            { zh: '整理空间',               en: 'Manage Space' },
  'staging.tab.pending':      { zh: '待确认',                 en: 'Pending' },
  'staging.tab.trash':        { zh: '回收站',                 en: 'Trash' },
  'staging.restore.btn':      { zh: '恢复',                  en: 'Restore' },
  'staging.loading':          { zh: '加载中…',                en: 'Loading…' },
  'staging.pending.empty':    { zh: '没有待确认的照片',         en: 'No photos pending' },
  'staging.pending.hint':     { zh: '标记「留在这里」的照片会出现在这里',
                                en: '"Leave here" photos will appear here' },
  'staging.hover.restore':    { zh: '悬停可单独恢复',          en: 'Hover to restore' },
  'staging.size.used':        { zh: '占用',                  en: 'used' },
  'staging.move.note':        { zh: '移入回收站后 30 天内仍可恢复，之后自动清除',
                                en: 'Up to 30 days to restore after moving to trash. Then auto-cleared.' },
  'staging.move.action':      { zh: '全部移入回收站',          en: 'Move all to trash' },
  'staging.moving':           { zh: '移入中…',                en: 'Moving…' },
  'trash.empty.title':        { zh: '回收站是空的',            en: 'Trash is empty' },
  'trash.empty.hint':         { zh: '移入回收站的照片会在 30 天后自动清除',
                                en: 'Photos in trash are auto-cleared after 30 days' },
  'trash.hover.restore':      { zh: '悬停可恢复单张',          en: 'Hover to restore' },
  'trash.purge.btn':          { zh: '提前清空回收站',          en: 'Empty trash now' },
  'trash.purge.confirm':      { zh: '确认永久清除',            en: 'Confirm Delete' },
  'trash.purge.cancel':       { zh: '取消',                  en: 'Cancel' },
  'trash.purge.clearing':     { zh: '清除中…',                en: 'Clearing…' },
}

// ── t() — lookup + optional {var} interpolation ───────────────────────────

export function t(
  key: string,
  lang: Language,
  vars?: Record<string, string | number>,
): string {
  const entry = translations[key]
  if (!entry) return key
  let str = entry[lang]
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return str
}

// ── Month names ───────────────────────────────────────────────────────────

export const MONTH_NAMES: Record<Language, string[]> = {
  zh: ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  en: ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}

// ── Date formatters ───────────────────────────────────────────────────────

const WEEKDAYS_ZH = ['日', '一', '二', '三', '四', '五', '六']
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function timeOfDay(hour: number, lang: Language): string {
  if (lang === 'en') {
    if (hour === 0) return 'midnight'
    if (hour === 12) return 'noon'
    if (hour < 12) return `${hour} am`
    return `${hour - 12} pm`
  }
  if (hour === 0) return '午夜'
  if (hour < 6) return `凌晨 ${hour} 点`
  if (hour < 12) return `上午 ${hour} 点`
  if (hour === 12) return '正午'
  if (hour < 18) return `下午 ${hour - 12} 点`
  if (hour < 21) return `傍晚 ${hour - 12} 点`
  return `夜里 ${hour - 12} 点`
}

export function formatShotAt(shotAt: string, lang: Language): string {
  const d = new Date(shotAt.replace(' ', 'T'))
  if (isNaN(d.getTime())) return shotAt
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hour = d.getHours()
  const timeStr = timeOfDay(hour, lang)
  if (lang === 'en') {
    const mn = MONTH_NAMES.en[month]
    const wd = WEEKDAYS_EN[d.getDay()]
    return `${wd}, ${mn} ${day}, ${year} · ${timeStr}`
  }
  const wd = WEEKDAYS_ZH[d.getDay()]
  return `${year}年${month}月${day}日，星期${wd}，${timeStr}`
}

export function formatEventTitle(shotAt: string, lang: Language): string {
  const d = new Date(shotAt.replace(' ', 'T'))
  if (isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hour = d.getHours()
  const timeStr = timeOfDay(hour, lang)
  if (lang === 'en') {
    const mn = MONTH_NAMES.en[month]
    return `${mn} ${day}, ${year} · ${timeStr}`
  }
  return `${year}年${month}月${day}日 · ${timeStr}的连拍`
}

export function formatDateShort(shotAt: string, lang: Language): string {
  const d = new Date(shotAt.replace(' ', 'T'))
  if (isNaN(d.getTime())) return shotAt
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const day = d.getDate()
  if (lang === 'en') return `${MONTH_NAMES.en[month]} ${day}, ${year}`
  return `${year}年${month}月${day}日`
}

// ── Camera name localisation ──────────────────────────────────────────────

export function simplifyCamera(model: string | undefined, lang: Language): string | null {
  if (!model) return null
  const m = model.toLowerCase()
  if (m.includes('ilce') || m.includes('sony') || /^a[679]\d/.test(m))
    return lang === 'en' ? 'Sony' : '索尼'
  if (m.includes('fujifilm') || m.includes('fuji') || m.startsWith('x-') || m.startsWith('gfx'))
    return lang === 'en' ? 'Fuji' : '富士'
  if (m.includes('iphone') || m.includes('apple')) return 'iPhone'
  if (m.includes('canon')) return lang === 'en' ? 'Canon' : '佳能'
  if (m.includes('nikon')) return lang === 'en' ? 'Nikon' : '尼康'
  if (m.includes('leica')) return lang === 'en' ? 'Leica' : '徕卡'
  if (m.includes('dji')) return 'DJI'
  return null
}

// ── Milestone messages ────────────────────────────────────────────────────

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

const MILESTONE_ZH: Record<string, readonly string[]> = {
  first_any: [
    '第一个瞬间，从地层里浮现了',
    '挖掘，开始了',
    '时间的第一层，被你触碰',
    '第一张，从黑暗里醒来',
  ],
  first_keep: [
    '这段记忆，属于你了',
    '放进行囊里了',
    '带上它，继续',
    '它会跟你走',
  ],
  first_leave: [
    '你让它留在了这里 — 它会等着',
    '它留在原地，等候时间',
    '这里是它的归宿',
    '你放下了它',
  ],
}

const MILESTONE_EN: Record<string, readonly string[]> = {
  first_any: [
    'The first moment, surfacing from the strata',
    'The excavation begins',
    'You\'ve reached the first layer of time',
    'The first one, waking from darkness',
  ],
  first_keep: [
    'This memory is yours now',
    'Tucked into your pack',
    'Take it with you. Keep going.',
    'It\'ll go where you go',
  ],
  first_leave: [
    'You left it here — it will wait',
    'It stays, held in place by time',
    'This is where it belongs',
    'You let it go',
  ],
}

export function getMilestone(key: string, lang: Language): string {
  const map = lang === 'en' ? MILESTONE_EN : MILESTONE_ZH
  const arr = map[key]
  if (!arr) return key
  return pickRandom(arr)
}

export function milestoneKeep(n: number, lang: Language): string {
  return lang === 'en'
    ? pickRandom([
        `You've carried forward ${n} memories`,
        `${n} moments now resting in your pack`,
        `${n} carried forward`,
        `${n} memories, gathered`,
      ] as const)
    : pickRandom([
        `你已经带走了 ${n} 段记忆`,
        `行囊里现在有 ${n} 个瞬间`,
        `${n} 段，带走了`,
        `${n} 个记忆，收好了`,
      ] as const)
}

export function milestoneTotal(n: number, lang: Language): string {
  return lang === 'en'
    ? pickRandom([
        `${n} photos, ${n} choices made`,
        `${n} moments passed through`,
        `${n} decisions, carved into time`,
        `${n} unearthed so far`,
      ] as const)
    : pickRandom([
        `${n} 张照片，${n} 个选择`,
        `走过了 ${n} 个瞬间`,
        `${n} 个决定，刻进了时间里`,
        `已经挖出了 ${n} 张`,
      ] as const)
}
