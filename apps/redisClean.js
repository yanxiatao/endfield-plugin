import { getMessage } from '../utils/common.js'

/**
 * Redis 清理：移除 ENDFIELD 命名空间下的无用/过期 key
 * 命令（仅管理员）：
 * - :redis清理
 * - :redis清理账号 <QQ列表>
 */

/** 当前仍在使用的 key 前缀白名单 */
const VALID_PREFIXES = [
  // 注意：ENDFIELD:GACHA:SIMULATE:DAILY:* 需按日期判断是否过期，单独由 DAILY_PREFIX 处理
  'ENDFIELD:USER:',
  'ENDFIELD:MAAEND_DEVICES:',
  'ENDFIELD:MAAEND_DEFAULT:',
  'ENDFIELD:MAAEND_JOBS:',
  'ENDFIELD:STAMINA_SUBSCRIBE',
  'ENDFIELD:ANNOUNCEMENT_SUBSCRIBE',
  'ENDFIELD:ANNOUNCEMENT_LAST_SEEN',
  'ENDFIELD:GACHA:SIMULATE:STATE:',
  'ENDFIELD:GACHA_PENDING:',
  'ENDFIELD:GACHA_LAST_ANALYSIS:',
  'ENDFIELD:PHONE_BIND:',
  'ENDFIELD:ATTENDANCE_SIGNED:',
]

const USER_BIND_KEY_PREFIX = 'ENDFIELD:USER:'
const CLEAN_ACCOUNT_CMD_PREFIX_REG = /^(?:[:：]|[/#](?:zmd|终末地))redis清理账号\s*/

/** 过期日期型 key（按日期判断是否过期） */
const DAILY_PREFIX = 'ENDFIELD:GACHA:SIMULATE:DAILY:'

/** 将 key 归类到功能前缀（如 ENDFIELD:USER:*），未匹配返回 null */
function getGroupPrefix(key) {
  for (const p of VALID_PREFIXES) {
    if (p.endsWith(':') && key.startsWith(p)) return p + '*'
    if (key === p) return p
  }
  if (key.startsWith(DAILY_PREFIX)) return DAILY_PREFIX + '*'
  return null
}

function isValidKey(key) {
  if (VALID_PREFIXES.some(p => key === p.replace(/:$/, '') || key.startsWith(p))) return true
  if (key.startsWith(DAILY_PREFIX)) {
    const rest = key.slice(DAILY_PREFIX.length)
    const dateStr = rest.split(':')[0]
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const keyDate = new Date(dateStr + 'T00:00:00')
      return !isNaN(keyDate.getTime()) && keyDate >= today
    }
    return true
  }
  return false
}

/**
 * 从命令文本中提取待清理的 QQ 号（每行首个数字）。
 * 支持：
 *   :redis清理账号 123456789
 *   :redis清理账号\n123456789(昵称)\n987654321(昵称)
 */
function parseTargetUserIds(msg = '') {
  const raw = String(msg || '')
  const payload = raw.replace(CLEAN_ACCOUNT_CMD_PREFIX_REG, '').trim()
  if (!payload) return []

  // 兼容不同端发送的换行符：\n / \r\n / U+2028 / U+2029
  const normalized = payload
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')

  const ids = []
  const seen = new Set()
  const pushId = (userId) => {
    if (!userId || seen.has(userId)) return
    seen.add(userId)
    ids.push(userId)
  }

  for (const lineRaw of normalized.split('\n')) {
    const line = lineRaw.trim()
    if (!line) continue
    // 每行取首个 QQ 号，兼容 "1.123456(昵称)" 等前缀
    const match = line.match(/(\d{5,12})(?!\d)/)
    if (match) pushId(match[1])
  }

  // 兜底：若仍只提取到很少数据，则从全文抓取所有 QQ 号
  // 可兼容少数客户端把“多行”压成单行的情况
  if (ids.length <= 1) {
    const fallback = normalized.match(/\d{5,12}(?!\d)/g) || []
    for (const userId of fallback) pushId(userId)
  }

  return ids
}

export class EndfieldRedisClean extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]Redis清理',
      dsc: '清理 ENDFIELD 命名空间下的无用 Redis key',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))redis清理账号(?:\\s+[\\s\\S]+)?$',
          fnc: 'cleanUserBindings',
          permission: 'master'
        },
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))redis清理$',
          fnc: 'cleanRedis',
          permission: 'master'
        }
      ]
    })
  }

  async cleanRedis() {
    if (!this.e?.isMaster) return false
    if (!redis) {
      await this.reply(getMessage('redis_clean.redis_unavailable'))
      return true
    }

    let allKeys = []
    try {
      allKeys = await redis.keys('ENDFIELD:*')
    } catch (err) {
      await this.reply(getMessage('redis_clean.scan_failed', { error: err?.message || err }))
      return true
    }

    if (allKeys.length === 0) {
      await this.reply(getMessage('redis_clean.no_keys'))
      return true
    }

    // 收集有设备绑定的用户，用于判断旧 MAAEND_DEFAULT / MAAEND_JOBS 是否孤立
    const maaDeviceUsers = new Set()
    for (const key of allKeys) {
      if (key.startsWith('ENDFIELD:MAAEND_DEVICES:')) {
        maaDeviceUsers.add(key.replace('ENDFIELD:MAAEND_DEVICES:', ''))
      }
    }

    const toDelete = []
    const kept = {}
    for (const key of allKeys) {
      // 旧 maa 键：MAAEND_DEFAULT / MAAEND_JOBS 没有对应 MAAEND_DEVICES → 孤立，清理
      if (key.startsWith('ENDFIELD:MAAEND_DEFAULT:')) {
        const uid = key.replace('ENDFIELD:MAAEND_DEFAULT:', '')
        if (!maaDeviceUsers.has(uid)) { toDelete.push(key); continue }
      }
      if (key.startsWith('ENDFIELD:MAAEND_JOBS:')) {
        const uid = key.replace('ENDFIELD:MAAEND_JOBS:', '')
        if (!maaDeviceUsers.has(uid)) { toDelete.push(key); continue }
      }

      if (isValidKey(key)) {
        const gp = getGroupPrefix(key) || 'ENDFIELD:*'
        kept[gp] = (kept[gp] || 0) + 1
      } else {
        toDelete.push(key)
      }
    }

    if (toDelete.length > 0) {
      for (const key of toDelete) {
        try {
          await redis.del(key)
        } catch (err) {
          logger.error(`[终末地插件][Redis清理] 删除 ${key} 失败: ${err?.message}`)
        }
      }
    }

    // 构建合并转发消息
    const msgs = []
    const botId = this.e.self_id || Bot.uin

    // 摘要
    const summary = [
      '【Redis 清理完成】',
      '',
      `扫描：${allKeys.length} 个 key`,
      `删除：${toDelete.length} 个无用 key`,
      `保留：${allKeys.length - toDelete.length} 个有效 key`,
    ]
    msgs.push({ message: summary.join('\n'), nickname: 'Redis 清理', user_id: botId })

    // 已删除明细
    if (toDelete.length > 0) {
      const grouped = {}
      for (const key of toDelete) {
        const gp = getGroupPrefix(key) || 'ENDFIELD:*'
        grouped[gp] = (grouped[gp] || 0) + 1
      }
      const delLines = ['已删除：']
      for (const [prefix, count] of Object.entries(grouped)) {
        delLines.push(`  ${prefix} × ${count}`)
      }
      msgs.push({ message: delLines.join('\n'), nickname: '删除明细', user_id: botId })

      // 详细 key 列表（超过 50 条截断）
      const detail = toDelete.slice(0, 50).map(k => `  ${k}`)
      if (toDelete.length > 50) detail.push(`  ...及其他 ${toDelete.length - 50} 个`)
      msgs.push({ message: '详细 key：\n' + detail.join('\n'), nickname: '删除列表', user_id: botId })
    }

    // 保留明细
    if (Object.keys(kept).length > 0) {
      const keepLines = ['保留：']
      for (const [prefix, count] of Object.entries(kept)) {
        keepLines.push(`  ${prefix} × ${count}`)
      }
      msgs.push({ message: keepLines.join('\n'), nickname: '保留明细', user_id: botId })
    }

    // 发送合并转发
    try {
      const forwardMsg = await this.e.group?.makeForwardMsg?.(msgs) || await this.e.friend?.makeForwardMsg?.(msgs)
      if (forwardMsg) {
        await this.reply(forwardMsg)
      } else {
        // 降级：逐条发送
        for (const m of msgs) await this.reply(m.message)
      }
    } catch {
      for (const m of msgs) await this.reply(m.message)
    }
    return true
  }

  async cleanUserBindings() {
    if (!this.e?.isMaster) return false
    if (!redis) {
      await this.reply(getMessage('redis_clean.redis_unavailable'))
      return true
    }

    const targetUserIds = parseTargetUserIds(this.e?.msg || '')
    if (targetUserIds.length === 0) {
      await this.reply(
        '请提供要清理的账号（每行一个 QQ 号）。\n示例：\n:redis清理账号 1637608752\n或\n:redis清理账号\n1637608752(苹果金凤梨)'
      )
      return true
    }

    const deletedIds = []
    const notFoundIds = []
    const failedItems = []

    for (const userId of targetUserIds) {
      const key = `${USER_BIND_KEY_PREFIX}${userId}`
      try {
        const result = await redis.del(key)
        if (Number(result) > 0) {
          deletedIds.push(userId)
        } else {
          notFoundIds.push(userId)
        }
      } catch (err) {
        failedItems.push({ userId, err: err?.message || String(err) })
      }
    }

    const report = [
      '【Redis 账号清理完成】',
      `目标账号：${targetUserIds.length}`,
      `已删除：${deletedIds.length}`,
      `未命中：${notFoundIds.length}`,
      `失败：${failedItems.length}`
    ]

    if (deletedIds.length > 0) {
      report.push('', '已删除 QQ：', deletedIds.join('\n'))
    }
    if (notFoundIds.length > 0) {
      report.push('', '未命中 QQ：', notFoundIds.join('\n'))
    }
    if (failedItems.length > 0) {
      const lines = failedItems.slice(0, 20).map(item => `${item.userId} (${item.err})`)
      if (failedItems.length > 20) lines.push(`... 及其他 ${failedItems.length - 20} 个`)
      report.push('', '失败明细：', lines.join('\n'))
    }

    await this.reply(report.join('\n'))
    return true
  }
}
