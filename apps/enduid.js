import { getMessage } from '../utils/common.js'
import { saveUserBindings, cleanAccounts, REDIS_KEY } from '../model/endfieldUser.js'
import EndfieldRequest from '../model/endfieldReq.js'
import setting from '../utils/setting.js'
import hypergryphAPI from '../model/hypergryphApi.js'
import { EndfieldOperator } from './operator.js'
import { getCopyright } from '../utils/copyright.js'
import common from '../../../lib/common/common.js'

// 网页授权绑定后台轮询任务
let authPollingTimer = null
let healthRecoveryTimer = null // 服务器不健康时，用于检测恢复的定时器

const POLL_INTERVAL_MS = 30 * 60 * 1000 // 30分钟轮询一次
const HEALTH_RECOVERY_INTERVAL_MS = 30 * 1000 // 服务器异常时，每30秒检测一次恢复
const AUTH_POLLING_START_DELAY_MS = 30 * 1000 // 启动后延迟 30 秒再执行第一次轮询

/**
 * 启动网页授权状态轮询任务
 * 定期检查所有网页授权类型的绑定，若授权被撤销则自动清理
 * 若 /health 检测不通过则暂停轮询，等服务器恢复后再开启
 * 保证：无论首次执行是否抛错，都会建立定时轮询，避免轮询“不执行”
 */
function startAuthPollingTask() {
  if (authPollingTimer) return

  const runPolling = async () => {
    try {
      const healthy = await hypergryphAPI.getUnifiedBackendHealth()
      if (!healthy) {
        if (authPollingTimer) {
          clearInterval(authPollingTimer)
          authPollingTimer = null
        }
        startHealthRecoveryCheck()
        return
      }
      await checkAllAuthBindings()
    } catch (err) {
      logger.error(`[终末地插件][授权轮询任务]执行出错: ${err}`)
    }
  }

  function startHealthRecoveryCheck() {
    if (healthRecoveryTimer) return
    healthRecoveryTimer = setInterval(async () => {
      try {
        const healthy = await hypergryphAPI.getUnifiedBackendHealth()
        if (healthy) {
          clearInterval(healthRecoveryTimer)
          healthRecoveryTimer = null
          authPollingTimer = setInterval(runPolling, POLL_INTERVAL_MS)
          await runPolling()
        }
      } catch (e) {
        logger.error(`[终末地插件][授权轮询]恢复检测异常: ${e}`)
      }
    }, HEALTH_RECOVERY_INTERVAL_MS)
  }

  function ensureIntervalStarted() {
    if (authPollingTimer || healthRecoveryTimer) return
    authPollingTimer = setInterval(runPolling, POLL_INTERVAL_MS)
  }

  // 延迟执行第一次轮询，且无论成功/抛错都确保启动定时器
  setTimeout(() => {
    runPolling()
      .catch((err) => logger.error(`[终末地插件][授权轮询]首次执行异常: ${err}`))
      .finally(ensureIntervalStarted)
  }, AUTH_POLLING_START_DELAY_MS)

}

/**
 * 检查所有用户的网页授权绑定状态
 * 使用 Redis 扫描 ENDFIELD:USER:*，对每个用户校验授权是否仍存在
 */
async function checkAllAuthBindings() {
  if (!redis) {
    logger.warn('[终末地插件][授权轮询]redis 不可用，跳过本轮')
    return
  }
  let keys = []
  try {
    keys = await redis.keys('ENDFIELD:USER:*')
  } catch (err) {
    logger.error(`[终末地插件][授权轮询]redis.keys 失败: ${err}`)
    return
  }
  if (!keys || keys.length === 0) return

  for (const key of keys) {
    const userId = key.replace(/^ENDFIELD:USER:/, '')
    try {
      await checkUserAuthBindings(userId)
    } catch (err) {
      logger.error(`[终末地插件][授权轮询]检查用户 ${userId} 失败: ${err}`)
    }
  }
}

/**
 * 检查单个用户的绑定状态（统一清理）
 * 1. 清理本地 is_active === false 的记录，并按 role_id 去重
 * 2. 检查网页授权类型账号的远程授权状态（按 client_id 分组查询）
 * 3. 根据远程返回的 is_active 字段，标记本地失效的授权
 * @param {string} userId 用户ID（绑定者 QQ）
 */
async function checkUserAuthBindings(userId) {
  const txt = await redis.get(REDIS_KEY(userId))
  if (!txt) return

  let accounts = []
  try {
    const parsed = JSON.parse(txt)
    accounts = Array.isArray(parsed) ? parsed : [parsed]
  } catch (err) {
    return
  }

  // 1. 先清理本地无效记录（is_active=false、role_id 重复）
  const cleaned = cleanAccounts(accounts)
  if (cleaned.length !== accounts.length) {
    accounts = cleaned
    await saveUserBindings(userId, accounts)
  }

  // 2. 检查网页授权类型的远程状态（按 client_id 分组查询）
  const authAccounts = accounts.filter(acc => acc.login_type === 'auth')
  if (authAccounts.length === 0) return

  // 按 client_id 分组查询（支持多个 client_id 的授权）
  const clientIdGroups = new Map()
  for (const acc of authAccounts) {
    const clientId = acc.client_id || String(Bot?.uin || '')
    if (!clientIdGroups.has(clientId)) {
      clientIdGroups.set(clientId, [])
    }
    clientIdGroups.get(clientId).push(acc)
  }

  let hasChanges = false
  const revokedAccounts = []

  for (const [clientId, clientAccounts] of clientIdGroups) {
    const authorizations = await hypergryphAPI.getClientPlatformAuthorizations(clientId, userId)
    // null = 网络/权限错误，跳过本次（不做任何操作）
    if (authorizations === null) continue

    // 构建远程活跃授权的 framework_token 集合（is_active !== false 表示有效）
    const activeTokens = new Set(
      authorizations
        .filter(auth => auth.is_active !== false)
        .map(auth => auth.framework_token)
    )

    // 检查本地账号的 framework_token 是否在远程活跃授权中
    for (const acc of clientAccounts) {
      const isActive = activeTokens.has(acc.framework_token)
      if (!isActive && acc.is_active !== false) {
        // 远程授权已失效，标记本地账号为无效
        acc.is_active = false
        hasChanges = true
        revokedAccounts.push(acc)
      }
    }
  }

  // 如果有变更，保存并通知用户
  if (hasChanges) {
    await saveUserBindings(userId, accounts)
    if (revokedAccounts.length > 0) {
      try {
        const nicknames = revokedAccounts.map(acc => acc.nickname || getMessage('common.unknown')).join('、')
        const notifyMsg = getMessage('enduid.auth_auto_revoked', { nickname: nicknames })
        if (Bot?.pickUser) {
          await Bot.pickUser(userId).sendMsg(notifyMsg)
        } else if (Bot?.sendPrivateMsg) {
          await Bot.sendPrivateMsg(userId, notifyMsg)
        }
      } catch (e) {
        // 通知失败不影响清理
      }
    }
  }
}

// 启动后台轮询任务（首次轮询即包含本地清理 + 远程授权检查，无需单独启动清理）
startAuthPollingTask()

export class EndfieldUid extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]登陆相关',
      dsc: '终末地森空岛账号信息管理',
      event: 'message',
      priority: 100,
      rule: [
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))扫码(绑定|登陆|登录)$',
          fnc: 'scanQRBind'
        },
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))授权(绑定|登陆|登录)$',
          fnc: 'authBind'
        },
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))(绑定|登陆|登录)(?:\\s+(.+))?$',
          fnc: 'credBind'
        },
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))(绑定|登陆|登录)列表$',
          fnc: 'bindList'
        },
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))删除(绑定|登陆|登录)\\s*(\\d+)$',
          fnc: 'deleteBind'
        },
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))切换(绑定|登陆|登录)\\s*(\\d+)$',
          fnc: 'switchBind'
        },
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))(绑定|登陆|登录)帮助$',
          fnc: 'credHelp'
        },
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))手机(绑定|登陆|登录)(\\s*\\d{11})?$',
          fnc: 'phoneBind'
        }
      ]
    })
    this.help_setting = setting.getConfig('help')
    this.common_setting = setting.getConfig('common')
  }

  /**
   * 绑定列表：授权登录账号走 authorization 客户端用户接口（全量展开）
   * GET /api/v1/authorization/clients/:client_id/users/:platform_id
   * 注意：同一个 framework_token 可能对应多个 role_id，不能按 token 去重
   */
  async getRemoteAuthorizationAccounts(accounts = []) {
    const authAccounts = (accounts || []).filter(acc => acc?.login_type === 'auth')
    if (authAccounts.length === 0) return null

    const userId = String(this.e.user_id)
    const clientIds = Array.from(new Set(
      authAccounts
        .map(acc => String(acc.client_id || this.e?.self_id || Bot?.uin || ''))
        .filter(Boolean)
    ))
    if (clientIds.length === 0) return null

    const out = []
    for (const clientId of clientIds) {
      const list = await hypergryphAPI.getClientPlatformAuthorizations(clientId, userId)
      if (!Array.isArray(list)) continue

      for (const item of list) {
        const bindingInfo = item?.binding_info || {}
        const roleId = String(bindingInfo.role_id || '')
        const gameRoleId = String(bindingInfo.game_role_id || bindingInfo.gameRoleId || '')
        if (!roleId) continue
        const ts = item?.created_at ? new Date(item.created_at).getTime() : Date.now()
        out.push({
          framework_token: String(item?.framework_token || ''),
          binding_id: item?.binding_id || item?.id || '',
          user_identifier: userId,
          role_id: roleId,
          ...(gameRoleId ? { game_role_id: gameRoleId } : {}),
          nickname: String(bindingInfo.nickname || ''),
          server_id: String(bindingInfo.server_id || 1),
          channel_name: String(bindingInfo.channel_name || ''),
          is_active: item?.is_active !== false,
          is_primary: false,
          client_type: 'bot',
          login_type: 'auth',
          level: Number(bindingInfo.level ?? 0),
          client_id: clientId,
          bind_time: Number.isFinite(ts) ? ts : Date.now(),
          last_sync: Date.now()
        })
      }
    }

    return out
  }

  /**
   * 绑定列表：扫码/手机等账号走第三方客户端绑定列表接口
   * GET /api/v1/bindings?user_identifier=...&client_type=bot
   */
  async getRemoteBindingMap(accounts = []) {
    const userId = String(this.e.user_id)
    const [list, remoteAuthAccounts] = await Promise.all([
      hypergryphAPI.getUnifiedBackendBindings(userId),
      this.getRemoteAuthorizationAccounts(accounts)
    ])
    const remoteMap = new Map()

    const addRemoteItem = (item = {}) => {
      const token = String(item?.framework_token || '')
      const roleId = String(item?.role_id ?? item?.binding_info?.role_id ?? '')
      const bindingId = item?.id ?? item?.binding_id ?? ''
      const normalized = {
        ...item,
        role_id: roleId,
        framework_token: token,
        binding_id: bindingId
      }
      if (token && roleId) remoteMap.set(`tr:${token}:${roleId}`, normalized)
      if (roleId && !remoteMap.has(`r:${roleId}`)) remoteMap.set(`r:${roleId}`, normalized)
      if (token && !remoteMap.has(`t:${token}`)) remoteMap.set(`t:${token}`, normalized)
    }

    if (Array.isArray(list)) {
      for (const item of list) addRemoteItem(item)
    }
    if (Array.isArray(remoteAuthAccounts)) {
      for (const item of remoteAuthAccounts) addRemoteItem(item)
    }

    return remoteMap
  }

  applyRemoteBindingData(localAccount, bindingMap) {
    const token = String(localAccount?.framework_token || '')
    const roleIdLocal = String(localAccount?.role_id || '')
    const remote = bindingMap.get(`tr:${token}:${roleIdLocal}`)
      || bindingMap.get(`r:${roleIdLocal}`)
      || bindingMap.get(`t:${token}`)
    if (!remote || typeof remote !== 'object') return localAccount

    const bindingInfo = remote.binding_info || {}
    const roleId = remote.role_id ?? bindingInfo.role_id
    const gameRoleId = remote.game_role_id ?? bindingInfo.game_role_id ?? bindingInfo.gameRoleId
    const nickname = remote.nickname ?? bindingInfo.nickname
    const serverId = remote.server_id ?? bindingInfo.server_id
    const channelName = remote.channel_name ?? bindingInfo.channel_name
    const bindingId = remote.id ?? remote.binding_id
    const isActive = remote.is_active

    return {
      ...localAccount,
      role_id: roleId != null && roleId !== '' ? String(roleId) : localAccount.role_id,
      ...(gameRoleId != null && gameRoleId !== ''
        ? { game_role_id: String(gameRoleId) }
        : {}),
      nickname: nickname != null && nickname !== '' ? String(nickname) : localAccount.nickname,
      server_id: serverId != null && serverId !== '' ? String(serverId) : localAccount.server_id,
      channel_name: channelName != null && channelName !== '' ? String(channelName) : localAccount.channel_name,
      binding_id: bindingId != null && bindingId !== '' ? bindingId : localAccount.binding_id,
      is_active: isActive === false ? false : localAccount.is_active
    }
  }

  /**
   * 登录后立刻通过两个远程接口回填 binding_id：
   * 1) /api/v1/bindings?user_identifier=...
   * 2) /api/v1/authorization/clients/:client_id/users/:platform_id
   */
  async refreshBindingIdsAfterLogin(accounts = []) {
    if (!Array.isArray(accounts) || accounts.length === 0) return accounts
    try {
      const remoteBindingMap = await this.getRemoteBindingMap(accounts)
      if (!remoteBindingMap || remoteBindingMap.size === 0) return accounts
      const synced = accounts.map((acc) => this.applyRemoteBindingData(acc, remoteBindingMap))
      const changed = JSON.stringify(synced) !== JSON.stringify(accounts)
      if (changed) {
        await saveUserBindings(this.e.user_id, synced)
      }
      return synced
    } catch (err) {
      logger.warn(`[终末地插件][登录后回填]刷新 binding_id 失败: ${err?.message || err}`)
      return accounts
    }
  }

  async saveUnifiedBackendBinding(frameworkToken, bindingData, loginType = 'unknown', clientId = null) {
    const newAccount = {
      framework_token: frameworkToken,
      binding_id: bindingData.id,
      user_identifier: String(this.e.user_id),
      role_id: String(bindingData.role_id || ''),
      ...(bindingData.game_role_id != null && bindingData.game_role_id !== ''
        ? { game_role_id: String(bindingData.game_role_id) }
        : {}),
      nickname: bindingData.nickname || '',
      server_id: String(bindingData.server_id || 1),
      ...(bindingData.channel_name != null && String(bindingData.channel_name).trim() !== ''
        ? { channel_name: String(bindingData.channel_name).trim() }
        : {}),
      is_active: true,
      is_primary: true,
      client_type: 'bot',
      login_type: loginType,
      client_id: clientId || String(this.e?.self_id || Bot?.uin || ''),
      bind_time: Date.now(),
      last_sync: Date.now()
    }

    const existingText = await redis.get(REDIS_KEY(this.e.user_id))
    let accounts = []

    if (existingText) {
      try {
        const existing = JSON.parse(existingText)
        accounts = Array.isArray(existing) ? existing : [existing]
      } catch (err) {
        logger.error(`[终末地插件]解析现有账号失败: ${err}`)
        accounts = []
      }
    }

    // 按 role_id 匹配：同一游戏角色则更新，不同角色则新增
    // is_active = true 表示账号有效，is_primary = true 表示当前选中
    const newRoleId = String(bindingData.role_id || '')
    const existingIndex = accounts.findIndex(acc => String(acc.role_id) === newRoleId && newRoleId !== '')
    if (existingIndex >= 0) {
      // 同一角色：更新绑定信息，设为当前选中
      const prev = accounts[existingIndex]
      accounts[existingIndex] = { ...prev, ...newAccount, login_type: prev.login_type || newAccount.login_type, is_active: true, is_primary: true }
      for (let i = 0; i < accounts.length; i++) {
        if (i !== existingIndex) accounts[i].is_primary = false
      }
    } else {
      // 不同角色：新增账号，所有账号保持有效，新账号设为当前选中
      newAccount.is_active = true
      newAccount.is_primary = true
      for (const a of accounts) a.is_primary = false
      accounts.push(newAccount)
    }

    // 按 role_id 去重，保留所有账号
    accounts = cleanAccounts(accounts)

    // 先写入本地，再通过远程接口刷新正确的 binding_id 并回写
    await saveUserBindings(this.e.user_id, accounts)
    accounts = await this.refreshBindingIdsAfterLogin(accounts)

    await this.reply(getMessage('enduid.login_ok', {
      nickname: bindingData.nickname,
      role_id: bindingData.role_id,
      server_id: bindingData.channel_name || bindingData.server_id || 1,
      count: accounts.length
    }))

    await saveUserBindings(this.e.user_id, accounts)
    // 绑定成功后自动发送干员列表（静默模式，不发加载提示，失败不影响绑定流程）
    try {
      const current = accounts.find(acc => String(acc.role_id || '') === newRoleId) || newAccount
      await this.sendOperatorListAfterLogin([current], frameworkToken)
    } catch (err) {
      logger.error(`[终末地插件][绑定]绑定成功后发送干员列表失败: ${err}`)
    }
    return true
  }

  normalizeAvailableRoles(roles = []) {
    if (!Array.isArray(roles)) return []
    const out = []
    const seen = new Set()

    for (const role of roles) {
      const roleId = String(role?.role_id || '').trim()
      if (!roleId || seen.has(roleId)) continue
      seen.add(roleId)

      out.push({
        role_id: roleId,
        ...(role?.game_role_id != null && role?.game_role_id !== ''
          ? { game_role_id: String(role.game_role_id) }
          : {}),
        server_id: String(role?.server_id || 1),
        server_name: String(role?.server_name || ''),
        nickname: String(role?.nickname || ''),
        skland_uid: String(role?.skland_uid || ''),
        channel_name: String(role?.channel_name || ''),
        level: Number(role?.level ?? 0),
        is_default: role?.is_default === true
      })
    }

    out.sort((a, b) => {
      if (a.is_default === b.is_default) return 0
      return a.is_default ? -1 : 1
    })
    return out
  }

  async saveUnifiedBackendBindings(frameworkToken, bindingList = [], loginType = 'unknown', clientId = null) {
    if (!Array.isArray(bindingList) || bindingList.length === 0) return false

    const existingText = await redis.get(REDIS_KEY(this.e.user_id))
    let accounts = []

    if (existingText) {
      try {
        const existing = JSON.parse(existingText)
        accounts = Array.isArray(existing) ? existing : [existing]
      } catch (err) {
        logger.error(`[终末地插件]解析现有账号失败: ${err}`)
        accounts = []
      }
    }

    const preferredRoleId = String(
      bindingList.find(item => item?.is_primary)?.role_id
      || bindingList[0]?.role_id
      || ''
    )
    const nowTs = Date.now()

    for (const item of bindingList) {
      const roleId = String(item?.role_id || '').trim()
      if (!roleId) continue

      const newAccount = {
        framework_token: frameworkToken,
        binding_id: item.id || item.binding_id || roleId,
        user_identifier: String(this.e.user_id),
        role_id: roleId,
        ...(item?.game_role_id != null && item?.game_role_id !== ''
          ? { game_role_id: String(item.game_role_id) }
          : {}),
        nickname: item.nickname || '',
        server_id: String(item.server_id || 1),
        ...(item.channel_name != null && String(item.channel_name).trim() !== ''
          ? { channel_name: String(item.channel_name).trim() }
          : {}),
        is_active: true,
        is_primary: preferredRoleId ? roleId === preferredRoleId : false,
        client_type: 'bot',
        login_type: loginType,
        client_id: clientId || String(this.e?.self_id || Bot?.uin || ''),
        bind_time: nowTs,
        last_sync: nowTs
      }

      const existingIndex = accounts.findIndex(acc => String(acc.role_id || '') === roleId)
      if (existingIndex >= 0) {
        const prev = accounts[existingIndex]
        accounts[existingIndex] = {
          ...prev,
          ...newAccount,
          login_type: prev.login_type || newAccount.login_type,
          is_active: true
        }
      } else {
        accounts.push(newAccount)
      }
    }

    if (preferredRoleId) {
      accounts = accounts.map(acc => ({
        ...acc,
        is_primary: String(acc.role_id || '') === preferredRoleId
      }))
    }

    accounts = cleanAccounts(accounts)
    if (accounts.length === 0) return false

    await saveUserBindings(this.e.user_id, accounts)
    accounts = await this.refreshBindingIdsAfterLogin(accounts)

    const currentBatch = bindingList
      .map((item) => {
        const roleId = String(item?.role_id || '')
        if (!roleId) return null
        return accounts.find(acc => String(acc?.role_id || '') === roleId) || item
      })
      .filter(Boolean)

    const lines = [
      getMessage('enduid.login_success_header'),
      getMessage('enduid.login_success_separator'),
      getMessage('enduid.login_success_batch', { count: currentBatch.length })
    ]
    currentBatch.forEach((acc, idx) => {
      lines.push(getMessage('enduid.login_success_item', {
        index: idx + 1,
        nickname: acc.nickname || getMessage('common.unknown'),
        role_id: acc.role_id || getMessage('common.unknown'),
        server_label: acc.channel_name || acc.server_id || getMessage('enduid.server_unknown')
      }))
    })
    lines.push(getMessage('enduid.login_success_total', { count: accounts.length }))
    await this.reply(lines.join('\n'))

    await saveUserBindings(this.e.user_id, accounts)
    // 多账号登录后按账号生成干员列表，并使用合并转发发送
    try {
      await this.sendOperatorListAfterLogin(currentBatch, frameworkToken)
    } catch (err) {
      logger.error(`[终末地插件][绑定]绑定成功后发送干员列表失败: ${err}`)
    }
    return true
  }

  async sendOperatorListAfterLogin(accounts = [], frameworkToken = '') {
    const targets = (Array.isArray(accounts) ? accounts : [])
      .filter(acc => acc && (acc.role_id || acc.game_role_id))
      .map(acc => ({
        role_id: String(acc.role_id || ''),
        game_role_id: String(acc.game_role_id || ''),
        server_id: Number(acc.server_id || 1),
        nickname: String(acc.nickname || ''),
        channel_name: String(acc.channel_name || ''),
        framework_token: String(acc.framework_token || frameworkToken || '')
      }))
      .filter(acc => (acc.role_id || acc.game_role_id) && acc.framework_token)

    if (targets.length === 0) return

    const operatorInstance = new EndfieldOperator()
    operatorInstance.e = this.e
    const rendered = []
    for (const acc of targets) {
      const roleId = acc.game_role_id || acc.role_id
      const img = await operatorInstance.getOperatorList({
        silent: true,
        retImage: true,
        frameworkToken: acc.framework_token,
        roleId,
        serverId: acc.server_id
      })
      if (img) rendered.push({ ...acc, role_id: roleId, img })
    }
    if (rendered.length === 0) return

    if (rendered.length === 1) {
      await this.reply(rendered[0].img)
      return
    }

    const forwardParts = rendered.map((item) => [
      getMessage('enduid.operator_list_item', {
        nickname: item.nickname || getMessage('common.unknown'),
        role_id: item.role_id || getMessage('common.unknown'),
        server_label: item.channel_name || item.server_id || getMessage('enduid.server_unknown')
      }),
      item.img
    ])
    const forwardMsg = common.makeForwardMsg(this.e, forwardParts, getMessage('enduid.operator_list_title'))
    await this.e.reply(forwardMsg)
  }

  async credBind() {
    if (this.e.isGroup) {
      await this.reply(getMessage('enduid.please_private'))
      return true
    }

    const match = String(this.e.msg || '').match(/^(?:[:：]|[/#](?:zmd|终末地))(?:绑定|登陆|登录)(?:\s+(.+))?$/)
    const cred = String(match?.[1] || '').trim()
    if (!cred) {
      await this.reply(getMessage('enduid.cred_bind_usage', { prefix: ':' }))
      return true
    }

    try {
      const verifyResult = await hypergryphAPI.unifiedBackendCredVerify(cred)
      if (verifyResult === false) {
        await this.reply(getMessage('enduid.cred_invalid'))
        return true
      }

      const loginData = await hypergryphAPI.unifiedBackendCredLogin(cred)
      if (!loginData || !loginData.framework_token) {
        await this.reply(getMessage('enduid.get_token_failed'))
        return true
      }

      const clientId = String(this.e?.self_id || Bot?.uin || '')
      const userIdentifier = String(this.e.user_id)
      const availableRoles = this.normalizeAvailableRoles(loginData.available_roles || [])

      const defaultRoleId = String(
        availableRoles.find(role => role?.is_default)?.role_id
        || availableRoles[0]?.role_id
        || ''
      )
      const createdBindings = []
      for (const role of availableRoles) {
        const isPrimary = defaultRoleId ? String(role.role_id) === defaultRoleId : createdBindings.length === 0
        const bindingRes = await hypergryphAPI.createUnifiedBackendBinding(
          loginData.framework_token,
          userIdentifier,
          isPrimary,
          clientId,
          role
        )
        if (!bindingRes) continue
        const gameRoleId = bindingRes.game_role_id ?? role.game_role_id ?? role.gameRoleId
        createdBindings.push({
          id: bindingRes.id || bindingRes.binding_id || role.role_id,
          role_id: String(bindingRes.role_id || role.role_id || ''),
          ...(gameRoleId != null && gameRoleId !== '' ? { game_role_id: String(gameRoleId) } : {}),
          nickname: bindingRes.nickname || role.nickname || '',
          server_id: String(bindingRes.server_id || role.server_id || 1),
          channel_name: bindingRes.channel_name || role.channel_name || '',
          is_primary: isPrimary
        })
      }

      if (createdBindings.length === 0) {
        const bindingRes = await hypergryphAPI.createUnifiedBackendBinding(
          loginData.framework_token,
          userIdentifier,
          true,
          clientId
        )
        if (!bindingRes) {
          await this.reply(getMessage('enduid.bind_create_failed'))
          return true
        }
        await this.saveUnifiedBackendBinding(loginData.framework_token, {
          ...bindingRes,
          channel_name: bindingRes.channel_name || ''
        }, 'cred', clientId)
      } else {
        const saved = await this.saveUnifiedBackendBindings(loginData.framework_token, createdBindings, 'cred', clientId)
        if (!saved) {
          await this.reply(getMessage('enduid.bind_create_failed'))
          return true
        }
      }
      return true
    } catch {
      await this.reply(getMessage('enduid.auth_error'))
      return true
    }
  }

  async authBind() {
    const config = this.common_setting || {}
    if (!config.api_key) {
      await this.reply(getMessage('common.need_api_key'))
      return true
    }

    try {
      // 授权绑定使用机器人自身 ID 作为 client_id，绑定者 QQ 作为 platform_id
      const clientId = String(this.e?.self_id || Bot?.uin || '')
      const clientName = config.auth_client_name || '终末地机器人'
      const clientType = config.auth_client_type || 'bot'
      const scopes = Array.isArray(config.auth_scopes) && config.auth_scopes.length > 0
        ? config.auth_scopes
        : ['user_info', 'binding_info', 'game_data', 'attendance']

      const authReq = await hypergryphAPI.createAuthorizationRequest({
        client_id: clientId,
        client_name: clientName,
        client_type: clientType,
        platform_id: String(this.e?.user_id || ''),
        scopes
      })

      if (!authReq || !authReq.request_id || !authReq.auth_url) {
        await this.reply(getMessage('enduid.auth_create_failed'))
        return true
      }

      const requestId = authReq.request_id
      const authUrl = authReq.auth_url
      const expiresAt = authReq.expires_at || ''

      const formattedTime = this.formatAuthExpiryTime(expiresAt)
      const msg = [
        getMessage('enduid.auth_link_intro') + '\n',
        authUrl,
        formattedTime ? '\n' + getMessage('enduid.auth_link_expiry', { time: formattedTime }) : '',
        '\n' + getMessage('enduid.auth_link_wait')
      ].join('')
      const authLinkSent = await this.reply(msg)

      const maxAttempts = 90
      let authData = null
      for (let i = 0; i < maxAttempts; i++) {
        await this.sleep(2000)
        const statusData = await hypergryphAPI.getAuthorizationRequestStatus(requestId)
        if (!statusData) continue
        if (statusData.status === 'used' || statusData.status === 'approved') {
          if (statusData.framework_token) {
            authData = statusData
            break
          }
        } else if (statusData.status === 'rejected') {
          await this.reply(getMessage('enduid.auth_rejected'))
          return true
        } else if (statusData.status === 'expired') {
          await this.reply(getMessage('enduid.auth_expired'))
          return true
        }
      }

      if (!authData || !authData.framework_token) {
        await this.reply(getMessage('enduid.auth_timeout'))
        return true
      }

      // 直接使用授权响应中的 binding_info，不再调用创建绑定接口
      if (!authData.binding_info || !authData.binding_info.role_id) {
        await this.reply(getMessage('enduid.bind_create_failed'))
        return true
      }
      
      // 构造绑定数据（使用授权响应中的 binding_info）
      const bindingData = {
        id: authData.binding_info.role_id, // 使用 role_id 作为临时 id
        role_id: authData.binding_info.role_id,
        nickname: authData.binding_info.nickname,
        server_id: authData.binding_info.server_id,
        channel_name: authData.binding_info.channel_name || '',
        level: authData.binding_info.level
      }

      await this.saveUnifiedBackendBinding(authData.framework_token, bindingData, 'auth', clientId)
      // 群聊时授权成功后撤回授权链接，私聊不管
      if (this.e.isGroup && authLinkSent?.message_id && this.e.group?.recallMsg) {
        try { await this.e.group.recallMsg(authLinkSent.message_id) } catch (e) { /* 撤回失败静默 */ }
      }
      return true
    } catch {
      await this.reply(getMessage('enduid.auth_error'))
      return true
    }
  }

  async scanQRBind() {
    try {
      const qrData = await hypergryphAPI.getUnifiedBackendQR()
      if (!qrData || !qrData.framework_token || !qrData.qrcode) {
        await this.reply(getMessage('enduid.get_qrcode_failed'))
        return true
      }

      const frameworkToken = qrData.framework_token
      const qrcodeBase64 = qrData.qrcode
      const qrCodeBuffer = Buffer.from(qrcodeBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
      const msg = [
        getMessage('enduid.qr_scan_prompt'),
        segment.image(qrCodeBuffer)
      ]
      const qrCodeSent = await this.reply(msg)

      const maxAttempts = 90
      let loginData = null

      for (let i = 0; i < maxAttempts; i++) {
        await this.sleep(2000)
        const statusData = await hypergryphAPI.getUnifiedBackendQRStatus(frameworkToken)
        if (!statusData) continue

        const status = String(statusData.status || '').toLowerCase()
        const stateCode = Number(statusData.code)
        const isDone = status === 'done'
          || (stateCode === 0 && status === '' && !!statusData.framework_token)
        const isExpired = status === 'expired' || stateCode === -2
        const isFailed = status === 'failed' || stateCode === -3

        if (isDone) {
          loginData = await hypergryphAPI.confirmUnifiedBackendLogin(frameworkToken, String(this.e.user_id))
          if (loginData && loginData.framework_token) {
            break
          }
        } else if (isExpired) {
          await this.reply(getMessage('enduid.qr_expired'))
          return true
        } else if (isFailed) {
          await this.reply(getMessage('enduid.qr_login_failed'))
          return true
        } else if (status === 'pending' || status === 'scanned' || status === 'authed') {
          // 静默等待确认，不发送中间状态消息
        }
      }

      if (!loginData || !loginData.framework_token) {
        await this.reply(getMessage('enduid.qr_timeout'))
        return true
      }

      const clientId = String(this.e?.self_id || Bot?.uin || '')
      const userIdentifier = String(this.e.user_id)
      const availableRoles = this.normalizeAvailableRoles(loginData.available_roles || [])
      const defaultRoleId = String(
        availableRoles.find(role => role?.is_default)?.role_id
        || availableRoles[0]?.role_id
        || ''
      )
      const createdBindings = []

      for (const role of availableRoles) {
        const isPrimary = defaultRoleId ? String(role.role_id) === defaultRoleId : createdBindings.length === 0
        const bindingRes = await hypergryphAPI.createUnifiedBackendBinding(
          loginData.framework_token,
          userIdentifier,
          isPrimary,
          clientId,
          role
        )
        if (!bindingRes) continue
        const gameRoleId = bindingRes.game_role_id ?? role.game_role_id ?? role.gameRoleId
        createdBindings.push({
          id: bindingRes.id || bindingRes.binding_id || role.role_id,
          role_id: String(bindingRes.role_id || role.role_id || ''),
          ...(gameRoleId != null && gameRoleId !== '' ? { game_role_id: String(gameRoleId) } : {}),
          nickname: bindingRes.nickname || role.nickname || '',
          server_id: String(bindingRes.server_id || role.server_id || 1),
          channel_name: bindingRes.channel_name || role.channel_name || '',
          is_primary: isPrimary
        })
      }

      // available_roles 为空或批量创建失败时，回退到默认单角色绑定
      if (createdBindings.length === 0) {
        const bindingRes = await hypergryphAPI.createUnifiedBackendBinding(
          loginData.framework_token,
          userIdentifier,
          true,
          clientId
        )
        if (!bindingRes) {
          await this.reply(getMessage('enduid.bind_create_failed'))
          return true
        }
        await this.saveUnifiedBackendBinding(loginData.framework_token, bindingRes, 'qr', clientId)
      } else {
        const saved = await this.saveUnifiedBackendBindings(loginData.framework_token, createdBindings, 'qr', clientId)
        if (!saved) {
          await this.reply(getMessage('enduid.bind_create_failed'))
          return true
        }
      }

      // 群聊时扫码成功后撤回二维码，私聊不管
      if (this.e.isGroup && qrCodeSent?.message_id && this.e.group?.recallMsg) {
        try { await this.e.group.recallMsg(qrCodeSent.message_id) } catch (e) { /* 撤回失败静默 */ }
      }
      return true
    } catch (error) {
      await this.reply(getMessage('enduid.qr_error'))
      return true
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async bindList() {
    // 直接使用本地 Redis 数据展示多账号
    let accounts = []
    const txt = await redis.get(REDIS_KEY(this.e.user_id))
    if (txt) {
      try {
        const parsed = JSON.parse(txt)
        const raw = Array.isArray(parsed) ? parsed : [parsed]
        accounts = cleanAccounts(raw)
        if (accounts.length !== raw.length) {
          await saveUserBindings(this.e.user_id, accounts)
        }
      } catch (err) {
        logger.error(`[终末地插件][绑定列表]解析账号失败: ${err}`)
      }
    }
    const originalAccounts = JSON.parse(JSON.stringify(accounts))

    // 授权接口展示字段缓存（role_id -> { level, nickname }）
    // 仅用于列表展示，不写入绑定持久化结构
    const authDisplayByRoleId = new Map()

    // 绑定列表数据源分流：
    // - 授权登录(auth/cred)：authorization/clients/:client_id/users/:platform_id（全量展开）
    // - 扫码/手机等：api/v1/bindings
    try {
      const [remoteAuthAccounts, bindingMap] = await Promise.all([
        this.getRemoteAuthorizationAccounts(accounts),
        this.getRemoteBindingMap(accounts)
      ])

      if (Array.isArray(remoteAuthAccounts)) {
        for (const acc of remoteAuthAccounts) {
          const rid = String(acc?.role_id || '')
          if (!rid) continue
          authDisplayByRoleId.set(rid, {
            level: Number(acc?.level ?? 0),
            nickname: String(acc?.nickname || '')
          })
        }
      }

      const primaryRoleId = String((accounts.find(acc => acc?.is_primary) || {}).role_id || '')
      const localAuth = accounts.filter(acc => acc?.login_type === 'auth')
      const localCred = accounts
        .filter(acc => acc?.login_type === 'cred')
        .map(acc => this.applyRemoteBindingData(acc, bindingMap))
      const localNonAuth = accounts
        .filter(acc => acc?.login_type !== 'auth' && acc?.login_type !== 'cred')
        .map(acc => this.applyRemoteBindingData(acc, bindingMap))
      const merged = remoteAuthAccounts
        ? [...localNonAuth, ...localCred, ...remoteAuthAccounts]
        : [...localNonAuth, ...localCred, ...localAuth]

      accounts = cleanAccounts(merged)
      if (accounts.length > 0) {
        let hasPrimary = false
        accounts = accounts.map((acc) => {
          const shouldPrimary = primaryRoleId && String(acc.role_id) === primaryRoleId
          if (shouldPrimary) hasPrimary = true
          return { ...acc, is_primary: shouldPrimary }
        })
        if (!hasPrimary) {
          accounts[0].is_primary = true
        }
      }
      const changed = JSON.stringify(accounts) !== JSON.stringify(originalAccounts)
      if (changed) {
        await saveUserBindings(this.e.user_id, accounts)
      }
    } catch (err) {
      logger.warn(`[终末地插件][绑定列表]远程绑定列表同步失败，使用本地缓存: ${err?.message || err}`)
    }

    const loginTypeLabel = {
      qr: getMessage('enduid.login_type_qr'),
      phone: getMessage('enduid.login_type_phone'),
      auth: getMessage('enduid.login_type_auth'),
      cred: getMessage('enduid.login_type_cred')
    }
    const serverLabel = (acc = {}) => {
      const channelName = String(acc?.channel_name || '').trim()
      if (channelName) return channelName
      return getMessage('common.unknown')
    }

    // 并行获取每个绑定的游戏数据（头像、等级），用索引作为 key 避免 role_id 类型不一致导致互相覆盖
    const gameDataByIndex = {}
    const notePromises = accounts.map(async (acc, index) => {
      if (!acc.framework_token || !acc.role_id) return
      try {
        const req = new EndfieldRequest(acc.role_id)
        req.setFrameworkToken(acc.framework_token)
        const res = await req.getData('note', {
          roleId: String(acc.role_id || ''),
          serverId: Number(acc.server_id || 1)
        })
        if (res?.code === 0 && res.data?.base) {
          gameDataByIndex[index] = {
            avatarUrl: res.data.base.avatarUrl || '',
            level: res.data.base.level ?? 0,
            name: res.data.base.name || ''
          }
        }
      } catch (err) {
        logger.warn(`[终末地插件][绑定列表]获取 ${acc.role_id} 游戏数据失败: ${err?.message || err}`)
      }
    })
    await Promise.all(notePromises)

    // 直接使用本地账号数据构建列表，按索引取对应游戏数据
    const bindingItems = accounts.map((acc, index) => {
      const typeLabel = loginTypeLabel[acc.login_type] || getMessage('common.unknown')
      const gameData = gameDataByIndex[index] || {}
      const bindTime = acc.bind_time ? new Date(acc.bind_time).toLocaleString('zh-CN') : getMessage('common.unknown')
      const authDisplay = authDisplayByRoleId.get(String(acc.role_id || '')) || {}
      const finalLevel = authDisplay.level || gameData.level || 0
      const finalName = authDisplay.nickname || acc.nickname || gameData.name || getMessage('common.unknown')
      
      return {
        index: index + 1,
        nickname: finalName,
        role_id: acc.role_id || getMessage('common.unknown'),
        server_label: serverLabel(acc),
        type_label: typeLabel,
        created_at: bindTime,
        isPrimary: !!acc.is_primary,
        avatarUrl: gameData.avatarUrl || '',
        level: finalLevel
      }
    })

    // 优先使用渲染模板出图，失败则回退文字
    if (this.e?.runtime?.render) {
      try {
        const pluResPath = this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
        const baseOpt = { scale: 1.6, retType: 'base64' }
        const renderData = {
          title: getMessage('enduid.bind_list_title'),
          subtitle: bindingItems.length > 0
            ? getMessage('enduid.bind_list_subtitle', { count: bindingItems.length })
            : getMessage('enduid.bind_list_subtitle_empty'),
          bindings: bindingItems,
          pluResPath,
          ...getCopyright()
        }
        const imgSegment = await this.e.runtime.render('endfield-plugin', 'enduid/bind-list', renderData, baseOpt)
        if (imgSegment) {
          await this.reply(imgSegment)
          return true
        }
      } catch (err) {
        logger.error(`[终末地插件][绑定列表]渲染图失败: ${err?.message || err}`)
      }
    }

    // 降级为纯文本
    let msg = getMessage('enduid.bind_list_text_title') + '\n\n'
    if (bindingItems.length === 0) {
      msg += getMessage('enduid.bind_list_empty') + '\n'
      msg += '\n' + getMessage('enduid.bind_list_help_hint', { prefix: this.getCmdPrefix() })
    } else {
      bindingItems.forEach((item, index) => {
        const activeMark = item.isPrimary ? getMessage('enduid.bind_list_active_mark') : ''
        const levelText = item.level ? getMessage('enduid.bind_list_level_text', { level: item.level }) : ''
        msg += getMessage('enduid.bind_list_item', {
          index: item.index,
          nickname: item.nickname,
          active_mark: activeMark,
          level_text: levelText,
          role_id: item.role_id,
          server_label: item.server_label,
          type_label: item.type_label,
          created_at: item.created_at
        }) + '\n'
        if (index < bindingItems.length - 1) msg += '\n'
      })
    }
    await this.reply(msg)
    return true
  }

  async deleteBind() {
    // 从本地 Redis 获取绑定列表（和 bindList 保持一致）
    let accounts = []
    const txt = await redis.get(REDIS_KEY(this.e.user_id))
    if (!txt) {
      await this.reply(getMessage('common.not_found_login_info'))
      return true
    }
    
    try {
      const parsed = JSON.parse(txt)
      const raw = Array.isArray(parsed) ? parsed : [parsed]
      accounts = cleanAccounts(raw)
    } catch (err) {
      logger.error(`[终末地插件][删除绑定]解析本地账号失败: ${err}`)
      await this.reply(getMessage('common.not_found_login_info'))
      return true
    }

    if (accounts.length === 0) {
      await this.reply(getMessage('common.not_found_login_info'))
      return true
    }

    // 获取用户输入的序号
    const index = parseInt(this.e.msg.match(/\d+/)?.[0] || '0')
    if (index < 1) {
      await this.reply(getMessage('enduid.delete_index_hint', { prefix: this.getCmdPrefix() }))
      return true
    }

    // 校验序号是否在本地列表范围内
    if (index > accounts.length) {
      await this.reply(getMessage('enduid.index_out_of_range', { count: accounts.length }))
      return true
    }

    // 获取要删除的账号
    const deletedAccount = accounts[index - 1]
    
    // 网页授权类型由后台任务自动检测，无需手动删除
    if (deletedAccount?.login_type === 'auth' || deletedAccount?.login_type === 'cred') {
      await this.reply(getMessage('enduid.unbind_auth_auto'))
      return true
    }

    // 尝试远程删除绑定
    let success = false
    if (deletedAccount.binding_id) {
      success = await hypergryphAPI.deleteUnifiedBackendBinding(
        deletedAccount.binding_id, 
        String(this.e.user_id)
      )
    }

    // 无论远程是否成功，都清理本地 Redis 记录
    try {
      const updatedAccounts = accounts.filter(acc => acc.role_id !== deletedAccount.role_id)
      await saveUserBindings(this.e.user_id, updatedAccounts)
    } catch (err) {
      logger.error(`[终末地插件][删除绑定]更新本地状态失败: ${err}`)
      await this.reply(getMessage('enduid.delete_failed'))
      return true
    }

    // 远程删除失败时给出提示
    if (!success) {
      logger.warn(`[终末地插件][删除绑定]远程删除失败，仅清理本地记录`)
      await this.reply(getMessage('enduid.delete_remote_failed'))
    }

    // 删除后展示最新绑定列表
    await this.bindList()
    return true
  }

  async switchBind() {
    // 从本地 Redis 获取绑定列表（和 bindList 保持一致）
    let accounts = []
    const txt = await redis.get(REDIS_KEY(this.e.user_id))
    if (!txt) {
      await this.reply(getMessage('common.not_found_login_info'))
      return true
    }
    
    try {
      const parsed = JSON.parse(txt)
      const raw = Array.isArray(parsed) ? parsed : [parsed]
      accounts = cleanAccounts(raw)
    } catch (err) {
      logger.error(`[终末地插件][切换绑定]解析本地账号失败: ${err}`)
      await this.reply(getMessage('common.not_found_login_info'))
      return true
    }

    if (accounts.length === 0) {
      await this.reply(getMessage('common.not_found_login_info'))
      return true
    }

    // 获取用户输入的序号
    const index = parseInt(this.e.msg.match(/\d+/)?.[0] || '0')
    if (index < 1) {
      await this.reply(getMessage('enduid.switch_index_hint', { prefix: this.getCmdPrefix() }))
      return true
    }

    // 校验序号是否在本地列表范围内
    if (index > accounts.length) {
      await this.reply(getMessage('enduid.index_out_of_range', { count: accounts.length }))
      return true
    }

    // 获取目标绑定账号
    let targetAccount = accounts[index - 1]

    // 切换前使用两个远程接口统一刷新 binding_id：
    // - /api/v1/bindings?user_identifier=...
    // - /api/v1/authorization/clients/:client_id/users/:platform_id
    try {
      const remoteBindingMap = await this.getRemoteBindingMap(accounts)
      const syncedAccounts = accounts.map((acc) => this.applyRemoteBindingData(acc, remoteBindingMap))
      const changed = JSON.stringify(syncedAccounts) !== JSON.stringify(accounts)
      if (changed) {
        accounts = syncedAccounts
        await saveUserBindings(this.e.user_id, accounts)
      }
      targetAccount = accounts[index - 1]
      if (targetAccount?.binding_id) {
      }
    } catch (err) {
      logger.warn(`[终末地插件][切换绑定]远程刷新 binding_id 失败: ${err?.message || err}`)
    }

    // 先尝试远程切换主绑定
    let remoteSuccess = false
    if (targetAccount.binding_id) {
      remoteSuccess = await hypergryphAPI.setUnifiedBackendPrimaryBinding(
        targetAccount.binding_id, 
        String(this.e.user_id)
      )
    }

    // 无论远程是否成功，都更新本地 Redis 的 is_primary 状态
    try {
      const updatedAccounts = accounts.map(acc => ({
        ...acc,
        is_primary: acc.role_id === targetAccount.role_id
      }))
      await saveUserBindings(this.e.user_id, updatedAccounts)
    } catch (err) {
      logger.error(`[终末地插件][切换绑定]更新本地状态失败: ${err}`)
      await this.reply(getMessage('enduid.switch_failed'))
      return true
    }

    // 远程切换失败时给出提示
    if (!remoteSuccess) {
      logger.warn(`[终末地插件][切换绑定]远程切换主绑定失败，仅更新本地状态`)
    }

    // 切换后展示最新绑定列表
    await this.bindList()
    return true
  }

  async phoneBind() {
    if (this.e.isGroup) {
      await this.reply(getMessage('enduid.phone_please_private'))
      return true
    }

    const phoneMatch = this.e.msg.match(/手机(?:绑定|登陆|登录)\s*(\d{11})/)
    const phone = phoneMatch ? phoneMatch[1] : null

    if (!phone) {
      await this.reply(getMessage('enduid.phone_ask_example', { prefix: this.getCmdPrefix() }))
      return true
    }

    await this.sendPhoneCodeAndWait(phone)
    return true
  }

  async sendPhoneCodeAndWait(phone) {
    const mask = `${phone.substring(0, 3)}****${phone.substring(7)}`

    const sendData = await hypergryphAPI.unifiedBackendSendPhoneCode(phone)
    if (!sendData) {
      await this.reply(getMessage('enduid.phone_send_failed'))
      return
    }

    const expireSec = Math.max(60, Math.min(1800, Number(sendData.expire) || 300))
    const sendFrameworkToken = String(sendData.framework_token || '').trim()
    const cacheData = {
      phone,
      timestamp: Date.now(),
      framework_token: sendFrameworkToken
    }
    await redis.set(`ENDFIELD:PHONE_BIND:${this.e.user_id}`, JSON.stringify(cacheData), { EX: expireSec })
    // 仅在「已发送验证码」后进入验证码会话态，避免任意 6 位数字触发处理
    this.finish('phoneVerifyCode')
    this.setContext('phoneVerifyCode', false, expireSec, getMessage('enduid.phone_code_expired'))

    const prefix = this.getCmdPrefix()
    await this.reply(getMessage('enduid.phone_code_sent', { mask, prefix }))
  }

  async phoneVerifyCode() {
    if (this.e.isGroup) return 'continue'

    // 仅当该用户存在待验证状态（发送过手机验证后）才将本条 6 位数字当作验证码处理
    const cacheText = await redis.get(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
    if (!cacheText) {
      this.finish('phoneVerifyCode')
      return 'continue'
    }

    const raw = (this.e.msg || '').replace(/^(?:[:：]|[/#](?:zmd|终末地))\s*/i, '').trim()
    const code = /^\d{6}$/.test(raw) ? raw : null
    if (!code) return 'continue'

    let cache
    try {
      cache = JSON.parse(cacheText)
    } catch {
      await this.reply(getMessage('enduid.phone_cache_error'))
      this.finish('phoneVerifyCode')
      return true
    }

    if (!cache || !cache.phone) {
      await this.reply(getMessage('enduid.phone_code_expired'))
      this.finish('phoneVerifyCode')
      return true
    }

    if (Date.now() - cache.timestamp > 5 * 60 * 1000) {
      await redis.del(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
      await this.reply(getMessage('enduid.phone_code_expired'))
      this.finish('phoneVerifyCode')
      return true
    }

    const phone = cache.phone
    const cacheFrameworkToken = String(cache.framework_token || '').trim()

    try {
      const loginData = await hypergryphAPI.unifiedBackendPhoneLogin(phone, code, cacheFrameworkToken)
      if (!loginData || !loginData.framework_token) {
        await this.reply(getMessage('enduid.phone_code_wrong'))
        await redis.del(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
        this.finish('phoneVerifyCode')
        return true
      }

      const clientId = String(this.e?.self_id || Bot?.uin || '')
      const userIdentifier = String(this.e.user_id)
      const availableRoles = this.normalizeAvailableRoles(loginData.available_roles || [])

      const defaultRoleId = String(
        availableRoles.find(role => role?.is_default)?.role_id
        || availableRoles[0]?.role_id
        || ''
      )
      const createdBindings = []

      for (const role of availableRoles) {
        const isPrimary = defaultRoleId ? String(role.role_id) === defaultRoleId : createdBindings.length === 0
        const bindingRes = await hypergryphAPI.createUnifiedBackendBinding(
          loginData.framework_token,
          userIdentifier,
          isPrimary,
          clientId,
          role
        )
        if (!bindingRes) continue
        const gameRoleId = bindingRes.game_role_id ?? role.game_role_id ?? role.gameRoleId
        createdBindings.push({
          id: bindingRes.id || bindingRes.binding_id || role.role_id,
          role_id: String(bindingRes.role_id || role.role_id || ''),
          ...(gameRoleId != null && gameRoleId !== '' ? { game_role_id: String(gameRoleId) } : {}),
          nickname: bindingRes.nickname || role.nickname || '',
          server_id: String(bindingRes.server_id || role.server_id || 1),
          channel_name: bindingRes.channel_name || role.channel_name || '',
          is_primary: isPrimary
        })
      }

      if (createdBindings.length === 0) {
        const bindingRes = await hypergryphAPI.createUnifiedBackendBinding(
          loginData.framework_token,
          userIdentifier,
          true,
          clientId
        )
        if (!bindingRes) {
          await this.reply(getMessage('enduid.bind_create_failed'))
          await redis.del(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
          this.finish('phoneVerifyCode')
          return true
        }
        await this.saveUnifiedBackendBinding(loginData.framework_token, bindingRes, 'phone', clientId)
      } else {
        const saved = await this.saveUnifiedBackendBindings(loginData.framework_token, createdBindings, 'phone', clientId)
        if (!saved) {
          await this.reply(getMessage('enduid.bind_create_failed'))
          await redis.del(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
          this.finish('phoneVerifyCode')
          return true
        }
      }

      await redis.del(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
      this.finish('phoneVerifyCode')
      return true
    } catch {
      await this.reply(getMessage('enduid.phone_login_error'))
      await redis.del(`ENDFIELD:PHONE_BIND:${this.e.user_id}`)
      this.finish('phoneVerifyCode')
      return true
    }
  }

  async credHelp() {
    const prefix = this.getCmdPrefix()
    const msg = getMessage('enduid.bind_help', { prefix })
    await this.reply(msg)
    return true
  }

  getCmdPrefix() {
    return ':'
  }

  formatAuthExpiryTime(isoString) {
    if (!isoString || typeof isoString !== 'string') return ''
    try {
      const d = new Date(isoString.trim())
      if (Number.isNaN(d.getTime())) return ''
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const h = String(d.getHours()).padStart(2, '0')
      const min = String(d.getMinutes()).padStart(2, '0')
      const s = String(d.getSeconds()).padStart(2, '0')
      return `${y}-${m}-${day} ${h}:${min}:${s}`
    } catch {
      return ''
    }
  }
}
