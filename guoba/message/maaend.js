/** MaaEnd 远程控制提示 */
export default [
  {
    component: 'Divider',
    label: 'MaaEnd 远程控制',
  },
  {
    field: 'maaend.no_api_key',
    label: 'MaaEnd - 未配置 API Key',
    component: 'Input',
  },
  {
    field: 'maaend.bind_private_only',
    label: 'MaaEnd - 绑定仅限私聊',
    component: 'Input',
  },
  {
    field: 'maaend.bind_failed',
    label: 'MaaEnd - 绑定失败',
    component: 'Input',
  },
  {
    field: 'maaend.bind_success',
    label: 'MaaEnd - 绑定成功',
    component: 'InputTextArea',
    componentProps: { rows: 3 },
  },
  {
    field: 'maaend.no_devices',
    label: 'MaaEnd - 无设备',
    component: 'InputTextArea',
    componentProps: { rows: 2 },
  },
  {
    field: 'maaend.no_devices_full',
    label: 'MaaEnd - 无设备（完整提示）',
    component: 'InputTextArea',
    componentProps: { rows: 3 },
  },
  {
    field: 'maaend.no_default_device',
    label: 'MaaEnd - 未设置默认设备',
    component: 'InputTextArea',
    componentProps: { rows: 2 },
  },
  {
    field: 'maaend.default_device_invalid',
    label: 'MaaEnd - 默认设备失效',
    component: 'Input',
  },
  {
    field: 'maaend.no_device_index',
    label: 'MaaEnd - 未指定设备序号',
    component: 'InputTextArea',
    componentProps: { rows: 2 },
  },
  {
    field: 'maaend.device_index_out',
    label: 'MaaEnd - 设备序号超出范围',
    component: 'Input',
  },
  {
    field: 'maaend.task_index_out',
    label: 'MaaEnd - 任务序号超出范围',
    component: 'Input',
  },
  {
    field: 'maaend.task_run_failed',
    label: 'MaaEnd - 任务执行失败',
    component: 'Input',
  },
  {
    field: 'maaend.device_offline',
    label: 'MaaEnd - 设备离线',
    component: 'Input',
  },
  {
    field: 'maaend.device_busy',
    label: 'MaaEnd - 设备忙碌',
    component: 'Input',
  },
  {
    field: 'maaend.request_failed',
    label: 'MaaEnd - 请求失败',
    component: 'Input',
  },
  {
    field: 'maaend.task_dispatched',
    label: 'MaaEnd - 任务已下发',
    component: 'InputTextArea',
    componentProps: { rows: 4 },
  },
  {
    field: 'maaend.job_not_found',
    label: 'MaaEnd - 任务未找到',
    component: 'Input',
  },
  {
    field: 'maaend.job_query_failed',
    label: 'MaaEnd - 查询任务失败',
    component: 'Input',
  },
  {
    field: 'maaend.query_failed',
    label: 'MaaEnd - 查询失败',
    component: 'Input',
  },
  {
    field: 'maaend.job_finish_title',
    label: 'MaaEnd - 任务完成标题',
    component: 'Input',
  },
  {
    field: 'maaend.job_finish_device',
    label: 'MaaEnd - 任务完成设备',
    component: 'Input',
  },
  {
    field: 'maaend.job_finish_duration',
    label: 'MaaEnd - 任务完成耗时',
    component: 'Input',
  },
  {
    field: 'maaend.job_finish_error',
    label: 'MaaEnd - 任务完成错误',
    component: 'Input',
  },
  {
    field: 'maaend.job_status_title',
    label: 'MaaEnd - 任务状态标题',
    component: 'Input',
  },
  {
    field: 'maaend.job_status_id',
    label: 'MaaEnd - 任务状态ID',
    component: 'Input',
  },
  {
    field: 'maaend.job_status_device',
    label: 'MaaEnd - 任务状态设备',
    component: 'Input',
  },
  {
    field: 'maaend.job_status_status',
    label: 'MaaEnd - 任务状态状态',
    component: 'Input',
  },
  {
    field: 'maaend.job_status_task',
    label: 'MaaEnd - 任务状态子任务',
    component: 'Input',
  },
  {
    field: 'maaend.job_status_progress',
    label: 'MaaEnd - 任务状态进度',
    component: 'Input',
  },
  {
    field: 'maaend.job_status_duration',
    label: 'MaaEnd - 任务状态耗时',
    component: 'Input',
  },
  {
    field: 'maaend.job_status_error',
    label: 'MaaEnd - 任务状态错误',
    component: 'Input',
  },
  {
    field: 'maaend.job_status_logs',
    label: 'MaaEnd - 任务状态日志标题',
    component: 'Input',
  },
  {
    field: 'maaend.job_status_log_line',
    label: 'MaaEnd - 任务状态日志条目',
    component: 'Input',
  },
  {
    field: 'maaend.stop_failed',
    label: 'MaaEnd - 停止任务失败',
    component: 'Input',
  },
  {
    field: 'maaend.stop_ok',
    label: 'MaaEnd - 停止任务成功',
    component: 'Input',
  },
  {
    field: 'maaend.screenshot_failed',
    label: 'MaaEnd - 截图失败',
    component: 'Input',
  },
  {
    field: 'maaend.reset_failed',
    label: 'MaaEnd - 重置失败',
    component: 'Input',
  },
  {
    field: 'maaend.reset_ok',
    label: 'MaaEnd - 重置成功',
    component: 'Input',
  },
  {
    field: 'maaend.delete_usage',
    label: 'MaaEnd - 删除设备用法',
    component: 'Input',
  },
  {
    field: 'maaend.delete_failed',
    label: 'MaaEnd - 删除设备失败',
    component: 'Input',
  },
  {
    field: 'maaend.delete_ok',
    label: 'MaaEnd - 删除设备成功',
    component: 'Input',
  },
  {
    field: 'maaend.no_job_history',
    label: 'MaaEnd - 无任务历史',
    component: 'Input',
  },
  {
    field: 'maaend.job_history_failed',
    label: 'MaaEnd - 获取任务历史失败',
    component: 'Input',
  },
  {
    field: 'maaend.job_history_title',
    label: 'MaaEnd - 任务历史标题',
    component: 'Input',
  },
  {
    field: 'maaend.job_history_item',
    label: 'MaaEnd - 任务历史条目',
    component: 'Input',
  },
  {
    field: 'maaend.status_online',
    label: 'MaaEnd - 设备状态在线',
    component: 'Input',
  },
  {
    field: 'maaend.status_offline',
    label: 'MaaEnd - 设备状态离线',
    component: 'Input',
  },
  {
    field: 'maaend.status_busy',
    label: 'MaaEnd - 设备状态忙碌',
    component: 'Input',
  },
  {
    field: 'maaend.job_status_pending',
    label: 'MaaEnd - 任务状态等待',
    component: 'Input',
  },
  {
    field: 'maaend.job_status_running',
    label: 'MaaEnd - 任务状态执行中',
    component: 'Input',
  },
  {
    field: 'maaend.job_status_completed',
    label: 'MaaEnd - 任务状态已完成',
    component: 'Input',
  },
  {
    field: 'maaend.job_status_failed',
    label: 'MaaEnd - 任务状态失败',
    component: 'Input',
  },
  {
    field: 'maaend.job_status_cancelled',
    label: 'MaaEnd - 任务状态已停止',
    component: 'Input',
  },
  {
    field: 'maaend.duration_seconds',
    label: 'MaaEnd - 耗时秒',
    component: 'Input',
  },
  {
    field: 'maaend.duration_minutes_seconds',
    label: 'MaaEnd - 耗时分秒',
    component: 'Input',
  },
  {
    field: 'maaend.duration_minutes',
    label: 'MaaEnd - 耗时分钟',
    component: 'Input',
  },
  {
    field: 'maaend.device_list_failed',
    label: 'MaaEnd - 设备列表失败',
    component: 'Input',
  },
  {
    field: 'maaend.device_list_title',
    label: 'MaaEnd - 设备列表标题',
    component: 'Input',
  },
  {
    field: 'maaend.device_list_count',
    label: 'MaaEnd - 设备列表数量',
    component: 'Input',
  },
  {
    field: 'maaend.device_list_default_mark',
    label: 'MaaEnd - 设备列表默认标记',
    component: 'Input',
  },
  {
    field: 'maaend.device_list_item',
    label: 'MaaEnd - 设备列表条目',
    component: 'Input',
  },
  {
    field: 'maaend.device_list_meta',
    label: 'MaaEnd - 设备列表元信息',
    component: 'Input',
  },
  {
    field: 'maaend.device_list_tasks',
    label: 'MaaEnd - 设备列表任务',
    component: 'Input',
  },
  {
    field: 'maaend.device_list_current_job',
    label: 'MaaEnd - 设备列表当前任务',
    component: 'Input',
  },
  {
    field: 'maaend.bind_code_title',
    label: 'MaaEnd - 绑定码标题',
    component: 'Input',
  },
  {
    field: 'maaend.bind_code_value',
    label: 'MaaEnd - 绑定码值',
    component: 'Input',
  },
  {
    field: 'maaend.bind_code_expire',
    label: 'MaaEnd - 绑定码过期',
    component: 'Input',
  },
  {
    field: 'maaend.bind_code_help',
    label: 'MaaEnd - 绑定码帮助',
    component: 'Input',
  },
  {
    field: 'maaend.bind_code_help2',
    label: 'MaaEnd - 绑定码帮助2',
    component: 'Input',
  },
  {
    field: 'maaend.task_list_failed',
    label: 'MaaEnd - 任务列表失败',
    component: 'Input',
  },
  {
    field: 'maaend.task_list_title',
    label: 'MaaEnd - 任务列表标题',
    component: 'Input',
  },
  {
    field: 'maaend.task_list_empty',
    label: 'MaaEnd - 任务列表为空',
    component: 'Input',
  },
  {
    field: 'maaend.task_list_label',
    label: 'MaaEnd - 任务列表标签',
    component: 'Input',
  },
  {
    field: 'maaend.task_list_desc',
    label: 'MaaEnd - 任务列表描述',
    component: 'Input',
  },
  {
    field: 'maaend.task_list_item',
    label: 'MaaEnd - 任务列表条目',
    component: 'Input',
  },
  {
    field: 'maaend.task_list_meta',
    label: 'MaaEnd - 任务列表元信息',
    component: 'Input',
  },
  {
    field: 'maaend.task_list_exec_hint',
    label: 'MaaEnd - 任务列表执行提示',
    component: 'Input',
  },
]
