import { getMessage } from '../utils/common.js'
import EndfieldRequest from '../model/endfieldReq.js'
import setting from '../utils/setting.js'
import { getCopyright } from '../utils/copyright.js'

const PROVIDER_LABEL = {
  all: '全量',
  skland: '国服',
  skport: '国际服'
}

export class EndfieldGachaGlobal extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]全服抽卡统计',
      dsc: '终末地全服抽卡统计',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))全服抽卡统计(?:\\s+(.+))?$',
          fnc: 'globalGachaStats'
        }
      ]
    })
  }

  parseArgs(msg) {
    const raw = String(msg || '')
      .replace(/^(?:[:：]|[/#](?:zmd|终末地))\s*/i, '')
      .replace(/^全服抽卡统计\s*/i, '')
      .trim()
    if (!raw) return { provider: '', poolPeriod: '', weaponPoolPeriod: '', refresh: false }

    const tokens = raw.split(/\s+/).filter(Boolean)
    let provider = ''
    let poolPeriod = ''
    let weaponPoolPeriod = ''
    let refresh = false
    const rest = []

    const mapProvider = (val) => {
      const v = String(val || '').trim().toLowerCase()
      if (['国服', 'skland', 'cn', 'official'].includes(v)) return 'skland'
      if (['国际服', 'skport', 'int', 'global'].includes(v)) return 'skport'
      if (['全量', '全部', 'all'].includes(v)) return 'all'
      return ''
    }

    for (const t of tokens) {
      if (!t) continue
      if (['刷新', '强制', 'refresh', 'force'].includes(t.toLowerCase())) {
        refresh = true
        continue
      }
      const p = mapProvider(t)
      if (p) {
        provider = p
        continue
      }
      const m = t.match(/^([^:=]+)[:=](.+)$/)
      if (m) {
        const key = m[1].trim().toLowerCase()
        const value = m[2].trim()
        if (!value) continue
        if (['provider', '平台'].includes(key)) {
          const pv = mapProvider(value)
          if (pv) provider = pv
          continue
        }
        if (['pool', 'pool_period', '限定', '限定池', '限定期', 'limited'].includes(key)) {
          poolPeriod = value
          continue
        }
        if (['weapon', 'weapon_pool_period', '武器', '武器池', '武器期'].includes(key)) {
          weaponPoolPeriod = value
          continue
        }
      }
      rest.push(t)
    }

    if (!poolPeriod && rest.length > 0) poolPeriod = rest.join(' ')

    return { provider, poolPeriod, weaponPoolPeriod, refresh }
  }

  getBannerInfoSource() {
    const gachaCfg = setting.getConfig('gacha') || {}
    const source = String(gachaCfg.banner_info?.source || 'backend_api').trim().toLowerCase()
    return source === 'local_file' ? 'local_file' : 'backend_api'
  }

  parseBannerTime(input) {
    if (input == null) return 0
    if (typeof input === 'number' && Number.isFinite(input)) {
      return input < 10000000000 ? input * 1000 : input
    }
    const raw = String(input || '').trim()
    if (!raw) return 0

    const withYear = raw.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?$/)
    if (withYear) {
      const year = Number(withYear[1])
      const month = Number(withYear[2])
      const day = Number(withYear[3])
      const hour = Number(withYear[4] ?? 0)
      const minute = Number(withYear[5] ?? 0)
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        const ts = new Date(year, month - 1, day, hour, minute, 0, 0).getTime()
        if (Number.isFinite(ts)) return ts
      }
      return 0
    }

    const m = raw.match(/^(\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?$/)
    if (m) {
      const month = Number(m[1])
      const day = Number(m[2])
      const hour = Number(m[3] ?? 0)
      const minute = Number(m[4] ?? 0)
      if (!Number.isFinite(month) || !Number.isFinite(day)) return 0
      if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return 0

      const now = new Date()
      const y = now.getFullYear()
      const candidates = [y - 1, y, y + 1]
        .map((year) => new Date(year, month - 1, day, hour, minute, 0, 0).getTime())
        .filter((t) => Number.isFinite(t))
      if (candidates.length === 0) return 0
      return candidates.reduce((best, cur) => {
        if (best == null) return cur
        return Math.abs(cur - now.getTime()) < Math.abs(best - now.getTime()) ? cur : best
      }, null) || 0
    }

    const normalized = raw.replace(/\//g, '-')
    const directTs = new Date(normalized).getTime()
    return Number.isFinite(directTs) ? directTs : 0
  }

  normalizePoolName(name) {
    const n = String(name || '').trim()
    if (!n) return ''
    const idx = n.indexOf('·')
    return idx !== -1 ? n.slice(idx + 1).trim() : n
  }

  parseBannerInfo(listRaw) {
    const list = Array.isArray(listRaw) ? listRaw : []
    const activeOnly = list.filter((a) => a?.is_active === true)
    let upCharNames = []
    let upWeaponName = ''
    let activeCharPoolName = ''
    let activeWeaponPoolName = ''
    const charUpMap = {}
    const weaponUpMap = {}

    const charActivity = activeOnly.find((a) => (a?.type || '') === '特许寻访')
    if (charActivity?.up && String(charActivity.up).trim()) {
      const upStr = String(charActivity.up).trim()
      upCharNames = [upStr]
    }
    activeCharPoolName = this.normalizePoolName(charActivity?.name)

    const weaponActivity = activeOnly.find((a) => (a?.type || '') === '武库申领')
    if (weaponActivity?.up && String(weaponActivity.up).trim()) {
      upWeaponName = String(weaponActivity.up).trim()
    }
    activeWeaponPoolName = this.normalizePoolName(weaponActivity?.name)

    for (const a of list) {
      if (!a?.name || !a?.up) continue
      const pName = this.normalizePoolName(a.name)
      const upStr = String(a.up).trim()
      if (!pName || !upStr) continue
      if ((a?.type || '') === '特许寻访') {
        charUpMap[pName] = [upStr]
      } else if ((a?.type || '') === '武库申领') {
        weaponUpMap[pName] = [upStr]
      }
    }

    const upCharName = upCharNames.length > 0 ? upCharNames.join('、') : ''
    return {
      upCharNames,
      upCharName,
      upWeaponName,
      activeCharPoolName,
      activeWeaponPoolName,
      charUpMap,
      weaponUpMap
    }
  }

  getCurrentUpFromLocalBannerData() {
    try {
      const bannerData = setting.getData('game_banners') || {}
      const upChars = Array.isArray(bannerData.up_characters) ? bannerData.up_characters : []
      const upWeapons = Array.isArray(bannerData.up_weapons) ? bannerData.up_weapons : []
      const permanentWeapons = Array.isArray(bannerData.permanent_weapons) ? bannerData.permanent_weapons : []
      const nowTs = Date.now()

      const rows = []
      for (const item of upChars) {
        const poolName = String(item?.pool_name || '').trim()
        const charName = String(item?.character_name || '').trim()
        if (!poolName || !charName) continue
        const startTs = this.parseBannerTime(item?.start_time)
        const endTs = this.parseBannerTime(item?.end_time)
        const isActive = startTs > 0 && endTs > 0 ? (nowTs >= startTs && nowTs <= endTs) : false
        rows.push({
          type: '特许寻访',
          name: `特许寻访·${poolName}`,
          up: charName,
          start_time: item?.start_time || '',
          start_ts: startTs,
          end_ts: endTs,
          is_active: isActive
        })
      }
      for (const item of upWeapons) {
        const poolName = String(item?.pool_name || '').trim()
        const weaponName = String(item?.weapon_name || '').trim()
        if (!poolName || !weaponName) continue
        const startTs = this.parseBannerTime(item?.start_time)
        const endTs = this.parseBannerTime(item?.end_time)
        const isActive = startTs > 0 && endTs > 0 ? (nowTs >= startTs && nowTs <= endTs) : false
        rows.push({
          type: '武库申领',
          name: `武库申领·${poolName}`,
          up: weaponName,
          start_time: item?.start_time || '',
          start_ts: startTs,
          end_ts: endTs,
          is_active: isActive
        })
      }
      for (const item of permanentWeapons) {
        const poolName = String(item?.pool_name || '').trim()
        const weaponName = String(item?.weapon_name || '').trim()
        if (!poolName || !weaponName) continue
        rows.push({
          type: '武库申领',
          name: `武库申领·${poolName}`,
          up: weaponName,
          start_time: '',
          start_ts: 0,
          end_ts: 0,
          is_active: true
        })
      }

      if (rows.length === 0) return null
      return this.parseBannerInfo(rows)
    } catch (e) {
      logger.error(`[终末地插件][全服抽卡统计]本地卡池信息读取失败: ${e?.message || e}`)
      return null
    }
  }

  async getCurrentUpFromBackendApi() {
    const commonCfg = setting.getConfig('common') || {}
    if (!commonCfg.api_key || String(commonCfg.api_key).trim() === '') return null
    try {
      const req = new EndfieldRequest(0, '', '')
      const res = await req.getWikiData('bili_wiki_activities')
      if (!res || res.code !== 0) return null
      const list = Array.isArray(res.data?.items) ? res.data.items : (Array.isArray(res.data?.activities) ? res.data.activities : [])
      return this.parseBannerInfo(list)
    } catch (e) {
      logger.error(`[终末地插件][全服抽卡统计]后端卡池信息获取失败: ${e?.message || e}`)
      return null
    }
  }

  async getCurrentBannerInfo() {
    const source = this.getBannerInfoSource()
    if (source === 'local_file') {
      const localRes = this.getCurrentUpFromLocalBannerData()
      if (localRes) return localRes
      return await this.getCurrentUpFromBackendApi()
    }
    const apiRes = await this.getCurrentUpFromBackendApi()
    if (apiRes) return apiRes
    return this.getCurrentUpFromLocalBannerData()
  }

  async fetchGlobalStats({ provider = '', poolPeriod = '', weaponPoolPeriod = '', refresh = false }) {
    const req = new EndfieldRequest(0, '', '')
    const baseUrl = req.unifiedBackendBaseUrl || 'https://end-api.shallow.ink'
    const headers = {}
    if (req.commonConfig?.api_key) headers['X-API-Key'] = req.commonConfig.api_key

    const qs = new URLSearchParams()
    if (provider && provider !== 'all') qs.set('provider', provider)
    if (poolPeriod) qs.set('pool_period', poolPeriod)
    if (weaponPoolPeriod) qs.set('weapon_pool_period', weaponPoolPeriod)
    if (refresh === true) qs.set('refresh', 'true')

    const query = qs.toString()
    const url = `${baseUrl}/api/endfield/gacha/global-stats${query ? `?${query}` : ''}`

    try {
      const response = await fetch(url, {
        timeout: 15000,
        method: 'get',
        headers: Object.keys(headers).length ? headers : undefined
      })
      if (!response.ok) return null
      const res = await response.json()
      if (!res || res.code !== 0) return null
      return res.data || null
    } catch (err) {
      logger.error(`[终末地插件][全服抽卡统计]获取失败: ${err?.message || err}`)
      return null
    }
  }

  formatSyncTime(cached, lastUpdate) {
    const time = this.formatDateTime(lastUpdate)
    if (cached === true && time) return `缓存 · ${time}`
    if (cached === true) return '缓存数据'
    if (time) return `最新 · ${time}`
    return '最新数据'
  }

  formatDateTime(input) {
    if (!input) return ''
    const d = new Date(input)
    if (!Number.isFinite(d.getTime())) return String(input)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  formatNum(value) {
    if (value == null) return '0'
    const n = Number(value)
    if (!Number.isFinite(n)) return String(value)
    return n.toLocaleString('zh-CN')
  }

  formatPercent(value, fallback = '-') {
    if (value == null) return fallback
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    return n.toFixed(1)
  }

  buildDistributionList(distRaw) {
    const list = Array.isArray(distRaw) ? distRaw : []
    if (list.length === 0) return []
    const maxCount = Math.max(...list.map((d) => Number(d?.count ?? 0)), 1)
    return list.map((d) => ({
      range: d?.range || '-',
      count: Number(d?.count ?? 0),
      pct: Math.round(((Number(d?.count ?? 0) || 0) / maxCount) * 100)
    }))
  }

  buildRankingList(rows, options = {}) {
    const list = Array.isArray(rows) ? rows : []
    const { upNames = [] } = options
    return list.map((r) => {
      const name = String(r?.char_name || r?.weapon_name || '').trim() || String(r?.char_id || r?.weapon_id || '').trim()
      if (!name) return null
      const isUp = upNames.length > 0 && upNames.some((n) => name === n || name.includes(n) || n.includes(name))
      return {
        name: name || '-',
        count: this.formatNum(r?.count ?? 0),
        percent: this.formatPercent(r?.percent, '0.0'),
        isUp
      }
    }).filter(Boolean)
  }

  buildPoolSection(stats, key, label, upNames = []) {
    const byType = stats?.by_type || {}
    const pool = byType?.[key] || {}
    const total = this.formatNum(pool?.total ?? 0)
    const star6 = this.formatNum(pool?.star6 ?? 0)
    const star6Limited = this.formatNum(pool?.star6_limited ?? 0)
    const star6Standard = this.formatNum(pool?.star6_standard ?? 0)
    const star5 = this.formatNum(pool?.star5 ?? 0)
    const star4 = this.formatNum(pool?.star4 ?? 0)
    const avgPity = pool?.avg_pity != null ? Number(pool.avg_pity).toFixed(1) : '-'
    const upAvgPity = pool?.up_avg_pity != null ? Number(pool.up_avg_pity).toFixed(1) : '-'
    const totalNum = Number(String(pool?.total ?? 0).replace(/,/g, '')) || 0
    const star6Num = Number(String(pool?.star6 ?? 0).replace(/,/g, '')) || 0
    const star6Rate = totalNum > 0 ? ((star6Num / totalNum) * 100).toFixed(2) + '%' : '0%'

    const ranking = stats?.ranking?.[key] || {}
    const rankingList6 = this.buildRankingList(ranking?.six_star || [], { upNames }).slice(0, 5)
    const rankingList5 = this.buildRankingList(ranking?.five_star || [], { upNames: [] }).slice(0, 5)
    return {
      key,
      label,
      total,
      star6,
      star6Limited,
      star6Standard,
      star5,
      star4,
      avgPity,
      upAvgPity,
      star6Rate,
      distributionList: this.buildDistributionList(pool?.distribution),
      rankingList6,
      rankingList5,
      showRanking: rankingList6.length > 0 || rankingList5.length > 0
    }
  }

  buildProviderCards(byProvider) {
    const rows = byProvider && typeof byProvider === 'object' ? byProvider : {}
    const items = []
    for (const key of Object.keys(rows)) {
      const d = rows[key] || {}
      items.push({
        key,
        label: PROVIDER_LABEL[key] || key,
        totalUsers: this.formatNum(d.total_users ?? 0),
        totalPulls: this.formatNum(d.total_pulls ?? 0),
        star6Total: this.formatNum(d.star6_total ?? 0),
        star5Total: this.formatNum(d.star5_total ?? 0),
        star4Total: this.formatNum(d.star4_total ?? 0),
        avgPity: d.avg_pity != null ? Number(d.avg_pity).toFixed(1) : '-',
        operatorTotal: this.formatNum(d.operator_total_pulls ?? 0),
        operatorStar6: this.formatNum(d.operator_star6_total ?? 0),
        operatorAvg: d.operator_avg_pity != null ? Number(d.operator_avg_pity).toFixed(1) : '-',
        weaponTotal: this.formatNum(d.weapon_total_pulls ?? 0),
        weaponStar6: this.formatNum(d.weapon_star6_total ?? 0),
        weaponAvg: d.weapon_avg_pity != null ? Number(d.weapon_avg_pity).toFixed(1) : '-'
      })
    }
    return items
  }

  buildChannelCards(byChannel) {
    const rows = byChannel && typeof byChannel === 'object' ? byChannel : {}
    const items = []
    for (const key of ['official', 'bilibili']) {
      const d = rows[key]
      if (!d) continue
      items.push({
        key,
        label: key === 'official' ? '官服 CN-01' : 'B服 CN-02',
        totalUsers: this.formatNum(d.total_users ?? 0),
        totalPulls: this.formatNum(d.total_pulls ?? 0),
        star6Total: this.formatNum(d.star6_total ?? 0),
        star5Total: this.formatNum(d.star5_total ?? 0),
        star4Total: this.formatNum(d.star4_total ?? 0),
        avgPity: d.avg_pity != null ? Number(d.avg_pity).toFixed(1) : '-',
        operatorTotal: this.formatNum(d.operator_total_pulls ?? 0),
        operatorStar6: this.formatNum(d.operator_star6_total ?? 0),
        operatorAvg: d.operator_avg_pity != null ? Number(d.operator_avg_pity).toFixed(1) : '-',
        weaponTotal: this.formatNum(d.weapon_total_pulls ?? 0),
        weaponStar6: this.formatNum(d.weapon_star6_total ?? 0),
        weaponAvg: d.weapon_avg_pity != null ? Number(d.weapon_avg_pity).toFixed(1) : '-'
      })
    }
    return items
  }

  buildRegionCards(byRegion) {
    const rows = byRegion && typeof byRegion === 'object' ? byRegion : {}
    const items = []
    for (const key of Object.keys(rows)) {
      if (String(key).trim().toLowerCase() === 'unknown') continue
      const d = rows[key] || {}
      items.push({
        key,
        label: key.toUpperCase(),
        totalUsers: this.formatNum(d.total_users ?? 0),
        totalPulls: this.formatNum(d.total_pulls ?? 0),
        star6Total: this.formatNum(d.star6_total ?? 0),
        star5Total: this.formatNum(d.star5_total ?? 0),
        star4Total: this.formatNum(d.star4_total ?? 0),
        avgPity: d.avg_pity != null ? Number(d.avg_pity).toFixed(1) : '-',
        operatorTotal: this.formatNum(d.operator_total_pulls ?? 0),
        operatorStar6: this.formatNum(d.operator_star6_total ?? 0),
        operatorAvg: d.operator_avg_pity != null ? Number(d.operator_avg_pity).toFixed(1) : '-',
        weaponTotal: this.formatNum(d.weapon_total_pulls ?? 0),
        weaponStar6: this.formatNum(d.weapon_star6_total ?? 0),
        weaponAvg: d.weapon_avg_pity != null ? Number(d.weapon_avg_pity).toFixed(1) : '-'
      })
    }
    return items
  }

  pickPeriodList(list, activeName = '', upMap = null) {
    const rows = Array.isArray(list) ? list : []
    return rows.map((p) => {
      let upNames = (p?.up_char_names || p?.up_weapon_names || []).filter(Boolean)
      if (upNames.length === 0 && upMap && typeof upMap === 'object') {
        const mapped = upMap[String(p?.pool_name || '')]
        if (Array.isArray(mapped) && mapped.length > 0) upNames = mapped.filter(Boolean)
      }
      return {
        name: p?.pool_name || '-',
        upNames,
        upText: upNames.length > 0 ? upNames.join('、') : '-',
        total: this.formatNum(p?.total_pulls ?? 0),
        star6: this.formatNum(p?.star6_count ?? 0),
        up: this.formatNum(p?.up_count ?? 0),
        upAvg: p?.up_avg_pity != null ? Number(p.up_avg_pity).toFixed(1) : '-',
        star6Avg: p?.star6_avg_pity != null ? Number(p.star6_avg_pity).toFixed(1) : '-',
        isActive: activeName ? String(p?.pool_name || '') === String(activeName) : false
      }
    })
  }

  async globalGachaStats() {
    const params = this.parseArgs(this.e?.msg)
    const data = await this.fetchGlobalStats(params)
    if (!data?.stats) {
      await this.reply(getMessage('gacha.global_stats_failed'))
      return true
    }

    const stats = data.stats || {}
    const providerLabel = PROVIDER_LABEL[data.provider || params.provider] || PROVIDER_LABEL.all
    const syncTime = this.formatSyncTime(data.cached, data.last_update)

    const totalPulls = this.formatNum(stats.total_pulls ?? 0)
    const totalUsers = this.formatNum(stats.total_users ?? 0)
    const star6Total = this.formatNum(stats.star6_total ?? 0)
    const star6Limited = this.formatNum(stats.star6_limited ?? 0)
    const star6Standard = this.formatNum(stats.star6_standard ?? 0)
    const star5Total = this.formatNum(stats.star5_total ?? 0)
    const star4Total = this.formatNum(stats.star4_total ?? 0)
    const avgPity = stats.avg_pity != null ? Number(stats.avg_pity).toFixed(1) : '-'
    const limitedUpAvgPity = stats.limited_up_avg_pity != null ? Number(stats.limited_up_avg_pity).toFixed(1) : '-'

    const operatorTotal = this.formatNum(stats.operator_total_pulls ?? 0)
    const operatorStar6 = this.formatNum(stats.operator_star6_total ?? 0)
    const operatorAvg = stats.operator_avg_pity != null ? Number(stats.operator_avg_pity).toFixed(1) : '-'

    const weaponTotal = this.formatNum(stats.weapon_total_pulls ?? 0)
    const weaponStar6 = this.formatNum(stats.weapon_star6_total ?? 0)
    const weaponAvg = stats.weapon_avg_pity != null ? Number(stats.weapon_avg_pity).toFixed(1) : '-'

    const currentPool = stats.current_pool || {}
    let currentPoolName = String(currentPool.pool_name || '').trim()
    let upCharNames = Array.isArray(currentPool.up_char_names) && currentPool.up_char_names.length > 0
      ? currentPool.up_char_names
      : (currentPool.up_char_name ? [currentPool.up_char_name] : [])

    const bannerInfo = await this.getCurrentBannerInfo()
    if (bannerInfo) {
      if (bannerInfo.activeCharPoolName) currentPoolName = bannerInfo.activeCharPoolName
      if (Array.isArray(bannerInfo.upCharNames) && bannerInfo.upCharNames.length > 0) {
        upCharNames = bannerInfo.upCharNames
      }
    }

    let upWeaponNames = []
    if (bannerInfo?.upWeaponName) {
      upWeaponNames = [bannerInfo.upWeaponName]
    } else if (params.weaponPoolPeriod) {
      const weaponPeriodsForParam = Array.isArray(stats.weapon_pool_periods) ? stats.weapon_pool_periods : []
      const weaponMatch = weaponPeriodsForParam.find((p) => String(p?.pool_name || '') === String(params.weaponPoolPeriod))
      if (weaponMatch?.up_weapon_names?.length) upWeaponNames = weaponMatch.up_weapon_names
    }

    const poolPeriods = Array.isArray(stats.pool_periods) ? stats.pool_periods : []
    const currentPoolRow = currentPoolName ? poolPeriods.find((p) => String(p?.pool_name || '') === currentPoolName) : null
    const currentPoolStats = currentPoolRow ? {
      total: this.formatNum(currentPoolRow.total_pulls ?? 0),
      star6: this.formatNum(currentPoolRow.star6_count ?? 0),
      up: this.formatNum(currentPoolRow.up_count ?? 0),
      upAvg: currentPoolRow.up_avg_pity != null ? Number(currentPoolRow.up_avg_pity).toFixed(1) : '-',
      star6Avg: currentPoolRow.star6_avg_pity != null ? Number(currentPoolRow.star6_avg_pity).toFixed(1) : '-'
    } : null

    const currentWeaponPoolName = String(bannerInfo?.activeWeaponPoolName || params.weaponPoolPeriod || '').trim()
    const weaponPeriodsForCurrent = Array.isArray(stats.weapon_pool_periods) ? stats.weapon_pool_periods : []
    const currentWeaponPoolRow = currentWeaponPoolName
      ? weaponPeriodsForCurrent.find((p) => String(p?.pool_name || '') === currentWeaponPoolName)
      : null
    const currentWeaponPoolStats = currentWeaponPoolRow ? {
      total: this.formatNum(currentWeaponPoolRow.total_pulls ?? 0),
      star6: this.formatNum(currentWeaponPoolRow.star6_count ?? 0),
      up: this.formatNum(currentWeaponPoolRow.up_count ?? 0),
      upAvg: currentWeaponPoolRow.up_avg_pity != null ? Number(currentWeaponPoolRow.up_avg_pity).toFixed(1) : '-',
      star6Avg: currentWeaponPoolRow.star6_avg_pity != null ? Number(currentWeaponPoolRow.star6_avg_pity).toFixed(1) : '-'
    } : null

    const poolSections = [
      this.buildPoolSection(stats, 'limited', params.poolPeriod ? `限定 · ${params.poolPeriod}` : '限定池', upCharNames),
      this.buildPoolSection(stats, 'weapon', params.weaponPoolPeriod ? `武器 · ${params.weaponPoolPeriod}` : '武器池', upWeaponNames),
      this.buildPoolSection(stats, 'standard', '常驻池', []),
      this.buildPoolSection(stats, 'beginner', '新手池', [])
    ]

    const providerCards = this.buildProviderCards(stats.by_provider)
    const channelCards = this.buildChannelCards(stats.by_channel)
    const regionCards = this.buildRegionCards(stats.by_region).slice(0, 4)

    const limitedPeriods = this.pickPeriodList(stats.pool_periods || [], params.poolPeriod, bannerInfo?.charUpMap)
      .sort((a, b) => Number(b.total.replace(/,/g, '')) - Number(a.total.replace(/,/g, '')))
      .sort((a, b) => (b.isActive === true ? 1 : 0) - (a.isActive === true ? 1 : 0))
      .slice(0, 4)
    const weaponPeriods = this.pickPeriodList(stats.weapon_pool_periods || [], params.weaponPoolPeriod, bannerInfo?.weaponUpMap)
      .sort((a, b) => Number(b.total.replace(/,/g, '')) - Number(a.total.replace(/,/g, '')))
      .sort((a, b) => (b.isActive === true ? 1 : 0) - (a.isActive === true ? 1 : 0))
      .slice(0, 4)
    const upPanelCount = (upCharNames && upCharNames.length > 0 ? 1 : 0) + (upWeaponNames && upWeaponNames.length > 0 ? 1 : 0)
    const showUpPanel = upPanelCount > 0
    const upPanelClass = upPanelCount <= 1 ? 'up-panel-single' : ''

    if (this.e?.runtime?.render) {
      try {
        const renderData = {
          title: '全服寻访统计',
          providerLabel,
          poolPeriod: params.poolPeriod || '',
          weaponPoolPeriod: params.weaponPoolPeriod || '',
          syncTime,
          totalPulls,
          totalUsers,
          star6Total,
          star6Limited,
          star6Standard,
          star5Total,
          star4Total,
          avgPity,
          limitedUpAvgPity,
          operatorTotal,
          operatorStar6,
          operatorAvg,
          weaponTotal,
          weaponStar6,
          weaponAvg,
          currentPoolName,
          currentPoolStats,
          currentWeaponPoolName,
          currentWeaponPoolStats,
          upCharNames,
          upWeaponNames,
          showUpPanel,
          upPanelClass,
          poolSections,
          providerCards,
          channelCards,
          regionCards,
          limitedPeriods,
          weaponPeriods,
          periodHint: '筛选示例：:全服抽卡统计 限定:卡池名 / 武器:卡池名 / 国服 / 国际服',
          ...getCopyright()
        }
        const imgSegment = await this.e.runtime.render('endfield-plugin', 'gacha/global-stats', renderData, { scale: 1.6, retType: 'base64' })
        if (imgSegment) {
          await this.reply(imgSegment)
          return true
        }
      } catch (err) {
        logger.error(`[终末地插件][全服抽卡统计]渲染图失败: ${err?.message || err}`)
      }
    }

    let text = getMessage('gacha.global_stats_fallback_title') + '\n'
    text += `口径: ${providerLabel}`
    if (params.poolPeriod) text += ` | 限定: ${params.poolPeriod}`
    if (params.weaponPoolPeriod) text += ` | 武器: ${params.weaponPoolPeriod}`
    text += `\n${syncTime}\n`
    text += `总抽数 ${totalPulls} / 统计用户 ${totalUsers} / 6星 ${star6Total} / 平均出货 ${avgPity}\n`
    text += `干员池 ${operatorTotal} 抽 / 6星 ${operatorStar6} / 均出 ${operatorAvg}\n`
    text += `武器池 ${weaponTotal} 抽 / 6星 ${weaponStar6} / 均出 ${weaponAvg}`
    await this.reply(text)
    return true
  }
}
