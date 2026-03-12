import { getUnbindMessage, getMessage } from '../utils/common.js'
import EndfieldUser from '../model/endfieldUser.js'
import setting from '../utils/setting.js'
import common from '../../../lib/common/common.js'
import { normalizeCronExpression } from '../utils/cron.js'

const ATTENDANCE_DAILY_MARK_PREFIX = 'ENDFIELD:ATTENDANCE_SIGNED:'

function getTaskCron(cronExpression, fallback, taskName) {
  try {
    return normalizeCronExpression(cronExpression || fallback)
  } catch (error) {
    logger.error(`[终末地插件][${taskName}] cron 表达式无效，已回退默认值: ${error?.message || error}`)
    return normalizeCronExpression(fallback)
  }
}

function getTodayDateStr() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getSecondsUntilTomorrow() {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setHours(24, 0, 0, 0)
  // 额外加 60 秒缓冲，避免 0 点附近边界抖动
  return Math.max(60, Math.ceil((tomorrow.getTime() - now.getTime()) / 1000) + 60)
}

async function loadTodayAttendanceMarkSet() {
  const key = `${ATTENDANCE_DAILY_MARK_PREFIX}${getTodayDateStr()}`
  const markSet = new Set()
  try {
    const txt = await redis.get(key)
    if (!txt) return { key, markSet }
    const arr = JSON.parse(txt)
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (!item) continue
        const v = String(item).trim()
        if (v) markSet.add(v)
      }
    }
  } catch (error) {
    logger.error(`[终末地插件][签到缓存]读取失败：${error?.message || error}`)
  }
  return { key, markSet }
}

async function saveTodayAttendanceMarkSet(key, markSet) {
  try {
    await redis.set(key, JSON.stringify(Array.from(markSet)), { EX: getSecondsUntilTomorrow() })
  } catch (error) {
    logger.error(`[终末地插件][签到缓存]写入失败：${error?.message || error}`)
  }
}

function getAttendanceMarkId(userId, sklUser) {
  const uid = String(userId || '')
  const roleId = Number(sklUser?.endfield_uid || 0)
  if (roleId > 0) return `${uid}:role:${roleId}`
  return ''
}

export class EndfieldAttendance extends plugin {
  constructor() {
    const signConfig = setting.getConfig('sign') || {}

    super({
      name: '[endfield-plugin]签到',
      dsc: '终末地森空岛签到',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))签到$',
          fnc: 'attendance'
        },
        {
          reg: '^(?:强制签到|(?:[:：]|[/#](?:zmd|终末地))强制签到)$',
          fnc: 'attendance_force'
        },
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))全部签到$',
          fnc: 'attendance_task',
          permission: 'master'
        },
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))签到缓存状态$',
          fnc: 'attendance_cache_status',
          permission: 'master'
        }
      ]
    })

    this.setting = signConfig
    this.task = {
      cron: getTaskCron(this.setting.auto_sign_cron, '0 0 1 * * ?', '森空岛签到任务'),
      name: '终末地森空岛签到任务',
      fnc: () => this.attendance_task()
    }
  }

  async attendance(force = false) {
    const isForce = force === true
    const userId = this.e.at || this.e.user_id
    const allUsers = await EndfieldUser.getAllUsers(userId)

    if (allUsers.length === 0) {
      await this.reply(getUnbindMessage())
      return true
    }

    const attendanceCache = await loadTodayAttendanceMarkSet()
    const markSet = attendanceCache.markSet
    let cacheDirty = false
    let hasCacheHit = false
    const results = []
    const unknownLabel = getMessage('common.unknown')

    const pushLine = (label, text) => {
      results.push(getMessage('common.label_line', { label, text }))
    }
    const addCache = (id) => {
      if (!id) return
      markSet.add(id)
      cacheDirty = true
    }
    const buildAwardsText = (awardIds, resourceInfoMap) => {
      if (!Array.isArray(awardIds) || awardIds.length === 0) {
        return ` ${getMessage('attendance.no_award_info')}`
      }
      const lines = []
      for (const award of awardIds) {
        const item = resourceInfoMap?.[award.id] || {}
        lines.push(getMessage('attendance.award_line', {
          name: item.name || unknownLabel,
          count: item.count ?? award.count ?? 0
        }))
      }
      return lines.join('\n')
    }

    for (const sklUser of allUsers) {
      const label = sklUser.nickname || sklUser.endfield_uid || unknownLabel
      const markId = getAttendanceMarkId(userId, sklUser)
      try {
        if (!isForce && markId && markSet.has(markId)) {
          pushLine(label, getMessage('attendance.cache_hit'))
          hasCacheHit = true
          continue
        }

        const res = await sklUser.sklReq.getData('endfield_attendance')

        if (!res || res.code !== 0) {
          logger.error(`[终末地插件][签到]账号 ${label} 请求失败: ${JSON.stringify(res)}`)
          pushLine(label, getMessage('attendance.sign_failed'))
          continue
        }

        if (res.data?.already_signed) {
          const text = isForce
            ? (res.data.message || getMessage('attendance.already_signed'))
            : getMessage('attendance.cache_hit')
          pushLine(label, text)
          addCache(markId)
          continue
        }

        const itemsText = buildAwardsText(res.data?.awardIds || [], res.data?.resourceInfoMap || {})
        const successText = getMessage('attendance.sign_success', { items: itemsText })
        pushLine(label, successText)
        addCache(markId)
      } catch (err) {
        logger.error(`[终末地插件][签到]账号 ${label} 异常: ${err}`)
        pushLine(label, getMessage('attendance.sign_exception'))
      }
    }

    if (cacheDirty) {
      await saveTodayAttendanceMarkSet(attendanceCache.key, markSet)
    }

    if (!isForce && hasCacheHit) {
      results.push(getMessage('attendance.force_hint'))
    }

    await this.reply(results.join('\n'))
    return true
  }

  async attendance_force() {
    return this.attendance(true)
  }

  async attendance_cache_status() {
    if (!this.e?.isMaster) return false
    if (!redis) {
      await this.reply(getMessage('attendance.redis_unavailable'))
      return true
    }

    const date = getTodayDateStr()
    const attendanceCache = await loadTodayAttendanceMarkSet()
    let ttl = -2
    try {
      ttl = await redis.ttl(attendanceCache.key)
    } catch (error) {
      logger.error(`[终末地插件][签到缓存]读取 TTL 失败：${error?.message || error}`)
    }

    const formatTtl = (seconds) => {
      const s = Number(seconds)
      if (s === -2) return getMessage('attendance.cache_ttl_uncreated')
      if (s === -1) return getMessage('attendance.cache_ttl_no_expire')
      if (!Number.isFinite(s) || s < 0) return getMessage('attendance.cache_ttl_unknown')
      const h = Math.floor(s / 3600)
      const m = Math.floor((s % 3600) / 60)
      const sec = s % 60
      return getMessage('attendance.cache_ttl_format', { h, m, sec })
    }

    const msg = getMessage('attendance.cache_status', {
      date,
      count: attendanceCache.markSet.size,
      ttl: formatTtl(ttl),
      key: attendanceCache.key
    })

    await this.reply(msg)
    return true
  }

  /**
   * 向 sign.yaml 中 notify_list 配置的目标推送消息
   * notify_list: { friend: [QQ号], group: [群号] }
   * @param {string} msg 要发送的文本
   * @param {string} [excludeId] 要排除的用户ID（避免手动触发时重复发送）
   */
  async sendNotifyList(msg, excludeId) {
    const cfg = this.setting?.notify_list
    if (!cfg) return
    const friendIds = Array.isArray(cfg.friend) ? cfg.friend : []
    const groupIds = Array.isArray(cfg.group) ? cfg.group : []
    for (const id of friendIds) {
      // 跳过空值和已排除的用户（手动触发者会通过 e.reply 接收消息）
      if (!id || String(id) === String(excludeId)) continue
      try {
        if (Bot?.pickUser) {
          await Bot.pickUser(id).sendMsg(msg)
        } else if (Bot?.sendPrivateMsg) {
          await Bot.sendPrivateMsg(id, msg)
        }
      } catch (e) {
        logger.error(`[终末地插件][签到任务]通知好友 ${id} 失败: ${e?.message || e}`)
      }
    }
    for (const id of groupIds) {
      if (!id) continue
      try {
        if (Bot?.pickGroup) {
          await Bot.pickGroup(id).sendMsg(msg)
        }
      } catch (e) {
        logger.error(`[终末地插件][签到任务]通知群 ${id} 失败: ${e?.message || e}`)
      }
    }
  }

  async attendance_task() {
    if (this.e?.msg && !this.e?.isMaster) return false
    if (!redis) {
      if (this.e?.msg) await this.reply(getMessage('attendance.redis_unavailable'))
      return true
    }
    const is_manual = !!this?.e?.msg
    this.setting = setting.getConfig('sign') || {}
    if (!is_manual && this.setting.auto_sign === false) return true

    const keys = await redis.keys('ENDFIELD:USER:*')
    const attendanceCache = await loadTodayAttendanceMarkSet()
    const stats = {
      cacheDirty: false,
      cacheSkip: 0,
      totalAccounts: 0,
      success: 0,
      signed: 0,
      fail: 0
    }
    const failUsers = []

    // 从配置读取通知列表（notify_list），向配置的QQ号发送消息
    // 手动触发时排除当前用户，避免 sendNotifyList 和 e.reply 重复发送
    const excludeId = is_manual ? String(this.e.user_id) : null
    const startMsg = getMessage('attendance.task_start_broadcast', { count: keys.length })
    await this.sendNotifyList(startMsg, excludeId)
    
    if (is_manual) {
      await this.e.reply(getMessage('attendance.task_start'))
    }

    // 第一轮：遍历所有账号进行签到，失败的只记录不重试
    for (const key of keys) {
      const user_id = key.replace(/ENDFIELD:USER:/g, '')
      const allUsers = await EndfieldUser.getAllUsers(user_id)

      if (allUsers.length === 0) {
        stats.fail += 1
        failUsers.push({ user_id, sklUser: null, reason: '未找到绑定账号' })
        continue
      }

      // 遍历该用户绑定的所有账号逐一签到
      for (const sklUser of allUsers) {
        stats.totalAccounts += 1
        const markId = getAttendanceMarkId(user_id, sklUser)
        if (markId && attendanceCache.markSet.has(markId)) {
          stats.signed += 1
          stats.cacheSkip += 1
          continue
        }

        await common.sleep(2000)
        try {
          const res = await sklUser.sklReq.getData('endfield_attendance')

          if (!res || res.code !== 0) {
            stats.fail += 1
            failUsers.push({ user_id, sklUser, reason: res?.message || '请求失败' })
            continue
          }

          if (res.data?.already_signed) {
            stats.signed += 1
            if (markId) {
              attendanceCache.markSet.add(markId)
              stats.cacheDirty = true
            }
            continue
          }

          stats.success += 1
          if (markId) {
            attendanceCache.markSet.add(markId)
            stats.cacheDirty = true
          }
        } catch (err) {
          stats.fail += 1
          failUsers.push({ user_id, sklUser, reason: err?.message || '签到异常' })
        }
      }
    }

    // 第二轮：所有账号签到完成后，对失败的账号进行重试
    if (failUsers.length > 0) {
      const retryFailUsers = []
      
      for (const failItem of failUsers) {
        if (!failItem.sklUser) {
          retryFailUsers.push(failItem)
          continue
        }
        
        await common.sleep(3000)
        try {
          const res = await failItem.sklUser.sklReq.getData('endfield_attendance')
          const markId = getAttendanceMarkId(failItem.user_id, failItem.sklUser)

          if (!res || res.code !== 0) {
            retryFailUsers.push(failItem)
            continue
          }

          if (res.data?.already_signed) {
            stats.signed += 1
            stats.fail -= 1
            if (markId) {
              attendanceCache.markSet.add(markId)
              stats.cacheDirty = true
            }
            continue
          }

          stats.success += 1
          stats.fail -= 1
          if (markId) {
            attendanceCache.markSet.add(markId)
            stats.cacheDirty = true
          }
        } catch (err) {
          retryFailUsers.push(failItem)
        }
      }

      // 更新最终失败列表
      failUsers.length = 0
      failUsers.push(...retryFailUsers)
    }

    if (stats.cacheDirty) {
      await saveTodayAttendanceMarkSet(attendanceCache.key, attendanceCache.markSet)
    }

    // 兜底：若出现异常分支导致计数偏差，按结果项反推一次
    const resultTotal = stats.signed + stats.success + stats.fail
    if (stats.totalAccounts < resultTotal) {
      stats.totalAccounts = resultTotal
    }
    const requested_count = Math.max(0, stats.totalAccounts - stats.cacheSkip)
    const before_signed_count = stats.signed
    const final_signed_count = Math.min(stats.totalAccounts, before_signed_count + stats.success)

    // 格式化报告
    let completeMsg = getMessage('attendance.task_complete', {
      total_users: keys.length,
      total_accounts: stats.totalAccounts,
      before_signed: before_signed_count,
      requested: requested_count,
      success: stats.success,
      fail: stats.fail,
      final_signed: final_signed_count,
      total: stats.totalAccounts,
      signed: final_signed_count
    })
    
    const hideFailUserListInGroupManual = is_manual && !!this.e?.isGroup
    if (failUsers.length > 0 && !hideFailUserListInGroupManual) {
      const failList = failUsers.map(f => {
        const label = f.sklUser ? `${f.user_id}(${f.sklUser.nickname || f.sklUser.endfield_uid})` : f.user_id
        return `${label}`
      }).join('\n')
      completeMsg += '\n\n' + getMessage('attendance.task_complete_fail_users', { fail_users: failList })
    }


    await this.sendNotifyList(completeMsg, excludeId)
    
    if (is_manual) {
      await this.e.reply(completeMsg)
    }
    return true
  }
}
