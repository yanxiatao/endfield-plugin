/** 理智相关提示 */
export default [
  {
    component: 'Divider',
    label: '理智',
  },
  {
    field: 'stamina.subscribed',
    label: '理智 - 已订阅',
    component: 'Input',
  },
  {
    field: 'stamina.subscribe_ok',
    label: '理智 - 订阅成功',
    component: 'Input',
  },
  {
    field: 'stamina.subscribe_ok_full',
    label: '理智 - 订阅成功（回满推送）',
    component: 'Input',
  },
  {
    field: 'stamina.subscribe_ok_threshold',
    label: '理智 - 订阅成功（阈值）',
    component: 'Input',
  },
  {
    field: 'stamina.push_msg',
    label: '理智 - 推送消息',
    component: 'Input',
  },
  {
    field: 'stamina.push_setting_example',
    label: '理智 - 推送设置示例',
    component: 'Input',
  },
  {
    field: 'stamina.unsubscribe_ok',
    label: '理智 - 取消订阅成功',
    component: 'Input',
  },
  {
    field: 'stamina.not_subscribed',
    label: '理智 - 未订阅',
    component: 'Input',
  },
  {
    field: 'stamina.loading',
    label: '理智 - 加载中',
    component: 'Input',
  },
  {
    field: 'stamina.role_not_found',
    label: '理智 - 角色未找到',
    component: 'Input',
  },
  {
    field: 'stamina.text_item',
    label: '理智 - 纯文本条目',
    component: 'InputTextArea',
    componentProps: {
      rows: 3,
    },
  },
  {
    field: 'stamina.text_simple',
    label: '理智 - 纯文本（单条）',
    component: 'InputTextArea',
    componentProps: {
      rows: 3,
    },
  },
  {
    field: 'stamina.full_time_unknown',
    label: '理智 - 回满时间未知',
    component: 'Input',
  },
  {
    field: 'stamina.full_time_full',
    label: '理智 - 已回满',
    component: 'Input',
  },
  {
    field: 'stamina.push_line',
    label: '理智 - 推送行',
    component: 'Input',
  },
  {
    field: 'stamina.push_setting_private_ok',
    label: '理智 - 推送设置私信',
    component: 'Input',
  },
  {
    field: 'stamina.push_setting_group_ok',
    label: '理智 - 推送设置群聊',
    component: 'Input',
  },
]
