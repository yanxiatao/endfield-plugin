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
        markSet.add(String(item))
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
  if (sklUser?.binding_id) return `${uid}:binding:${sklUser.binding_id}`
  if (sklUser?.framework_token) return `${uid}:token:${sklUser.framework_token}`
  if (sklUser?.nickname) return `${uid}:nickname:${sklUser.nickname}`
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
    this.common_setting = setting.getConfig('common')
    this.task = {
      cron: getTaskCron(this.setting.auto_sign_cron, '0 0 1 * * ?', '森空岛签到任务'),
      name: '终末地森空岛签到任务',
      fnc: () => this.attendance_task()
    }
  }

  async attendance() {
    const userId = this.e.at || this.e.user_id
    const allUsers = await EndfieldUser.getAllUsers(userId)

    if (allUsers.length === 0) {
      await this.reply(getUnbindMessage())
      return true
    }

    const attendanceCache = await loadTodayAttendanceMarkSet()
    let cacheDirty = false
    const results = []
    for (const sklUser of allUsers) {
      const label = sklUser.nickname || sklUser.endfield_uid || '未知'
      const markId = getAttendanceMarkId(userId, sklUser)
      try {
        if (markId && attendanceCache.markSet.has(markId)) {
          results.push(`【${label}】今日已签到（缓存）`)
          continue
        }

        const res = await sklUser.sklReq.getData('endfield_attendance')

        if (!res || res.code !== 0) {
          logger.error(`[终末地插件][签到]账号 ${label} 请求失败: ${JSON.stringify(res)}`)
          results.push(`【${label}】签到失败`)
          continue
        }

        if (res.data?.already_signed) {
          results.push(`【${label}】${res.data.message || '今日已签到'}`)
          if (markId) {
            attendanceCache.markSet.add(markId)
            cacheDirty = true
          }
          continue
        }

        const awardIds = res.data?.awardIds || []
        const resourceInfoMap = res.data?.resourceInfoMap || {}
        let msg = `【${label}】签到完成！获得:`

        if (!awardIds.length) {
          msg += ` 无奖励信息`
        } else {
          for (let award of awardIds) {
            const item = resourceInfoMap?.[award.id] || {}
            msg += `\n  ${item.name || '未知'} * ${item.count ?? award.count ?? 0}`
          }
        }
        results.push(msg)
        if (markId) {
          attendanceCache.markSet.add(markId)
          cacheDirty = true
        }
      } catch (err) {
        logger.error(`[终末地插件][签到]账号 ${label} 异常: ${err}`)
        results.push(`【${label}】签到异常`)
      }
    }

    if (cacheDirty) {
      await saveTodayAttendanceMarkSet(attendanceCache.key, attendanceCache.markSet)
    }

    await this.reply(results.join('\n'))
    return true
  }

  async attendance_cache_status() {
    if (!this.e?.isMaster) return false
    if (!redis) {
      await this.reply('Redis 不可用')
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
      if (s === -2) return '未创建'
      if (s === -1) return '无过期时间'
      if (!Number.isFinite(s) || s < 0) return '未知'
      const h = Math.floor(s / 3600)
      const m = Math.floor((s % 3600) / 60)
      const sec = s % 60
      return `${h}小时${m}分${sec}秒`
    }

    const msg = [
      '[ 签到缓存状态 ]',
      '─────────',
      `日期 ${date}`,
      `缓存账号 ${attendanceCache.markSet.size}`,
      `剩余TTL ${formatTtl(ttl)}`,
      `缓存键 ${attendanceCache.key}`,
      '─────────'
    ].join('\n')

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
    // 兼容旧版数组格式
    let friendIds = []
    let groupIds = []
    if (Array.isArray(cfg)) {
      for (const raw of cfg) {
        const str = String(raw).trim()
        const lower = str.toLowerCase()
        if (lower.startsWith('group:')) groupIds.push(str.slice(6).trim())
        else if (lower.startsWith('friend:')) friendIds.push(str.slice(7).trim())
      }
    } else {
      friendIds = Array.isArray(cfg.friend) ? cfg.friend : []
      groupIds = Array.isArray(cfg.group) ? cfg.group : []
    }
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
    const is_manual = !!this?.e?.msg
    this.setting = setting.getConfig('sign') || {}
    if (!is_manual && this.setting.auto_sign === false) return true

    const keys = await redis.keys('ENDFIELD:USER:*')
    const attendanceCache = await loadTodayAttendanceMarkSet()
    let cacheDirty = false
    let cache_skip_count = 0
    let total_account_count = 0
    let success_count = 0
    let signed_count = 0
    let fail_count = 0
    const fail_users = []

    logger.mark('[终末地插件][签到任务]签到任务开始')

    // 从配置读取通知列表（notify_list），向配置的QQ号发送消息
    // 手动触发时排除当前用户，避免 sendNotifyList 和 e.reply 重复发送
    const excludeId = is_manual ? String(this.e.user_id) : null
    const startMsg = getMessage('attendance.task_start_broadcast', { count: keys.length })
    await this.sendNotifyList(startMsg, excludeId)
    
    if (is_manual) {
      await this.e.reply(getMessage('attendance.task_start'))
    }

    // 第一轮：遍历所有账号进行签到，失败的只记录不重试
    for (let key of keys) {
      const user_id = key.replace(/ENDFIELD:USER:/g, '')
      const allUsers = await EndfieldUser.getAllUsers(user_id)

      if (allUsers.length === 0) {
        fail_count += 1
        fail_users.push({ user_id, sklUser: null, reason: '未找到绑定账号' })
        continue
      }

      // 遍历该用户绑定的所有账号逐一签到
      for (const sklUser of allUsers) {
        total_account_count += 1
        const markId = getAttendanceMarkId(user_id, sklUser)
        if (markId && attendanceCache.markSet.has(markId)) {
          signed_count += 1
          cache_skip_count += 1
          continue
        }

        await common.sleep(2000)
        try {
          const res = await sklUser.sklReq.getData('endfield_attendance')

          if (!res || res.code !== 0) {
            fail_count += 1
            fail_users.push({ user_id, sklUser, reason: res?.message || '请求失败' })
            continue
          }

          if (res.data?.already_signed) {
            signed_count += 1
            if (markId) {
              attendanceCache.markSet.add(markId)
              cacheDirty = true
            }
            continue
          }

          success_count += 1
          if (markId) {
            attendanceCache.markSet.add(markId)
            cacheDirty = true
          }
        } catch (err) {
          fail_count += 1
          fail_users.push({ user_id, sklUser, reason: err?.message || '签到异常' })
        }
      }
    }

    // 第二轮：所有账号签到完成后，对失败的账号进行重试
    if (fail_users.length > 0) {
      logger.mark(`[终末地插件][签到任务]第一轮完成，开始重试 ${fail_users.length} 个失败账号`)
      const retry_fail_users = []
      
      for (const failItem of fail_users) {
        if (!failItem.sklUser) {
          retry_fail_users.push(failItem)
          continue
        }
        
        await common.sleep(3000)
        try {
          const res = await failItem.sklUser.sklReq.getData('endfield_attendance')
          const markId = getAttendanceMarkId(failItem.user_id, failItem.sklUser)

          if (!res || res.code !== 0) {
            retry_fail_users.push(failItem)
            continue
          }

          if (res.data?.already_signed) {
            signed_count += 1
            fail_count -= 1
            if (markId) {
              attendanceCache.markSet.add(markId)
              cacheDirty = true
            }
            continue
          }

          success_count += 1
          fail_count -= 1
          if (markId) {
            attendanceCache.markSet.add(markId)
            cacheDirty = true
          }
          logger.mark(`[终末地插件][签到任务]重试成功: ${failItem.user_id}(${failItem.sklUser.nickname || failItem.sklUser.endfield_uid})`)
        } catch (err) {
          retry_fail_users.push(failItem)
        }
      }

      // 更新最终失败列表
      fail_users.length = 0
      fail_users.push(...retry_fail_users)
    }

    if (cacheDirty) {
      await saveTodayAttendanceMarkSet(attendanceCache.key, attendanceCache.markSet)
    }

    // 兜底：若出现异常分支导致计数偏差，按结果项反推一次
    const resultTotal = signed_count + success_count + fail_count
    if (total_account_count < resultTotal) {
      total_account_count = resultTotal
    }
    const requested_count = Math.max(0, total_account_count - cache_skip_count)
    const before_signed_count = signed_count
    const final_signed_count = Math.min(total_account_count, before_signed_count + success_count)

    // 格式化报告
    let completeMsg = '[ 签到任务报告 ]\n─────────\n'
    completeMsg += `总计用户 ${keys.length}\n`
    completeMsg += `总计游戏账号 ${total_account_count}\n`
    completeMsg += '─────────\n'
    completeMsg += `执行前已签 ${before_signed_count}\n`
    completeMsg += `实际请求 ${requested_count}\n`
    completeMsg += '─────────\n'
    completeMsg += `本次新签 ${success_count}\n`
    completeMsg += `本次失败 ${fail_count}\n`
    completeMsg += '─────────\n'
    completeMsg += `执行后已签 ${final_signed_count} / ${total_account_count}\n`
    completeMsg += '─────────'
    
    const hideFailUserListInGroupManual = is_manual && !!this.e?.isGroup
    if (fail_users.length > 0 && !hideFailUserListInGroupManual) {
      completeMsg += '\n\n失败账号:\n'
      completeMsg += fail_users.map(f => {
        const label = f.sklUser ? `${f.user_id}(${f.sklUser.nickname || f.sklUser.endfield_uid})` : f.user_id
        return `${label}`
      }).join('\n')
    }

    logger.mark(`[终末地插件][签到任务]任务完成：用户${keys.length}个 账号${total_account_count}个\n执行前已签：${before_signed_count}个 缓存命中：${cache_skip_count}个 请求：${requested_count}个\n本次新签：${success_count}个 失败：${fail_count}个 执行后已签：${final_signed_count}个`)

    await this.sendNotifyList(completeMsg, excludeId)
    
    if (is_manual) {
      await this.e.reply(completeMsg)
    }
    return true
  }
}
