/** Redis 清理提示 */
export default [
  {
    component: 'Divider',
    label: 'Redis 清理',
  },
  {
    field: 'redis_clean.redis_unavailable',
    label: 'Redis - 不可用',
    component: 'Input',
  },
  {
    field: 'redis_clean.scan_failed',
    label: 'Redis - 扫描失败',
    component: 'Input',
  },
  {
    field: 'redis_clean.no_keys',
    label: 'Redis - 无键值',
    component: 'Input',
  },
  {
    field: 'redis_clean.summary',
    label: 'Redis - 清理摘要',
    component: 'InputTextArea',
    componentProps: { rows: 6 },
  },
  {
    field: 'redis_clean.forward_title',
    label: 'Redis - 合并转发标题',
    component: 'Input',
  },
  {
    field: 'redis_clean.deleted_header',
    label: 'Redis - 已删除标题',
    component: 'Input',
  },
  {
    field: 'redis_clean.deleted_line',
    label: 'Redis - 已删除行',
    component: 'Input',
  },
  {
    field: 'redis_clean.forward_deleted_title',
    label: 'Redis - 删除明细标题',
    component: 'Input',
  },
  {
    field: 'redis_clean.detail_header',
    label: 'Redis - 详细 key 标题',
    component: 'Input',
  },
  {
    field: 'redis_clean.detail_line',
    label: 'Redis - 详细 key 行',
    component: 'Input',
  },
  {
    field: 'redis_clean.detail_more',
    label: 'Redis - 详细 key 更多',
    component: 'Input',
  },
  {
    field: 'redis_clean.forward_detail_title',
    label: 'Redis - 删除列表标题',
    component: 'Input',
  },
  {
    field: 'redis_clean.kept_header',
    label: 'Redis - 保留标题',
    component: 'Input',
  },
  {
    field: 'redis_clean.kept_line',
    label: 'Redis - 保留行',
    component: 'Input',
  },
  {
    field: 'redis_clean.forward_kept_title',
    label: 'Redis - 保留明细标题',
    component: 'Input',
  },
  {
    field: 'redis_clean.clean_accounts_usage',
    label: 'Redis - 账号清理用法',
    component: 'InputTextArea',
    componentProps: { rows: 5 },
  },
  {
    field: 'redis_clean.account_report_title',
    label: 'Redis - 账号清理报告标题',
    component: 'Input',
  },
  {
    field: 'redis_clean.account_report_targets',
    label: 'Redis - 账号清理目标数',
    component: 'Input',
  },
  {
    field: 'redis_clean.account_report_deleted',
    label: 'Redis - 账号清理删除数',
    component: 'Input',
  },
  {
    field: 'redis_clean.account_report_not_found',
    label: 'Redis - 账号清理未命中数',
    component: 'Input',
  },
  {
    field: 'redis_clean.account_report_failed',
    label: 'Redis - 账号清理失败数',
    component: 'Input',
  },
  {
    field: 'redis_clean.account_deleted_header',
    label: 'Redis - 已删除 QQ 标题',
    component: 'Input',
  },
  {
    field: 'redis_clean.account_not_found_header',
    label: 'Redis - 未命中 QQ 标题',
    component: 'Input',
  },
  {
    field: 'redis_clean.account_failed_header',
    label: 'Redis - 失败明细标题',
    component: 'Input',
  },
  {
    field: 'redis_clean.account_failed_more',
    label: 'Redis - 失败明细更多',
    component: 'Input',
  },
]
