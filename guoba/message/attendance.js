/** 签到相关提示 */
export default [
  {
    component: 'Divider',
    label: '签到',
  },
  {
    field: 'attendance.sign_failed',
    label: '签到 - 签到失败',
    component: 'Input',
  },
  {
    field: 'attendance.already_signed',
    label: '签到 - 已签到',
    component: 'Input',
  },
  {
    field: 'attendance.cache_hit',
    label: '签到 - 已签到（缓存）',
    component: 'Input',
  },
  {
    field: 'attendance.force_hint',
    label: '签到 - 强制签到提示',
    component: 'InputTextArea',
    componentProps: {
      rows: 2,
    },
  },
  {
    field: 'attendance.sign_success',
    label: '签到 - 签到成功',
    component: 'Input',
  },
  {
    field: 'attendance.no_award_info',
    label: '签到 - 无奖励信息',
    component: 'Input',
  },
  {
    field: 'attendance.award_line',
    label: '签到 - 奖励条目',
    component: 'Input',
  },
  {
    field: 'attendance.sign_exception',
    label: '签到 - 签到异常',
    component: 'Input',
  },
  {
    field: 'attendance.redis_unavailable',
    label: '签到 - Redis 不可用',
    component: 'Input',
  },
  {
    field: 'attendance.cache_ttl_uncreated',
    label: '签到 - 缓存未创建',
    component: 'Input',
  },
  {
    field: 'attendance.cache_ttl_no_expire',
    label: '签到 - 缓存无过期时间',
    component: 'Input',
  },
  {
    field: 'attendance.cache_ttl_unknown',
    label: '签到 - 缓存未知',
    component: 'Input',
  },
  {
    field: 'attendance.cache_ttl_format',
    label: '签到 - TTL 格式',
    component: 'Input',
  },
  {
    field: 'attendance.cache_status',
    label: '签到 - 缓存状态',
    component: 'InputTextArea',
    componentProps: {
      rows: 6,
    },
  },
  {
    field: 'attendance.task_start',
    label: '签到 - 任务开始',
    component: 'Input',
  },
  {
    field: 'attendance.task_start_broadcast',
    label: '签到 - 任务开始广播',
    component: 'InputTextArea',
    componentProps: {
      rows: 2,
    },
  },
  {
    field: 'attendance.task_complete',
    label: '签到 - 任务完成',
    component: 'InputTextArea',
    componentProps: {
      rows: 3,
    },
  },
  {
    field: 'attendance.task_complete_fail_users',
    label: '签到 - 失败用户列表',
    component: 'InputTextArea',
    componentProps: {
      rows: 2,
    },
  },
]
