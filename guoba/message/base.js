/** 锅巴配置：消息配置（基础说明与通用配置） */
export default [
  {
    label: '消息配置',
    component: 'SOFT_GROUP_BEGIN'
  },
  {
    component: 'Alert',
    componentProps: {
      type: 'info',
      message: '提示：消息配置支持占位符 {name}。配置保存到 config/message.yaml，defSet/message.yaml 为默认配置不可修改。',
    },
  },
  {
    component: 'Divider',
    label: '基础配置',
  },
  {
    field: 'bluemap_help_doc',
    label: '蓝图文档链接',
    component: 'Input',
    componentProps: {
      placeholder: 'https://www.kdocs.cn/l/caI2H6e4APLS',
    },
  },
  {
    field: 'official_website',
    label: '官网链接',
    component: 'Input',
    componentProps: {
      placeholder: 'https://end.shallow.ink',
    },
  },
  {
    field: 'prefixTips',
    label: '命令前缀提示',
    component: 'Input',
  },
  {
    field: 'unbind_message',
    label: '未绑定账号提示',
    component: 'InputTextArea',
    componentProps: {
      rows: 4,
    },
  },
]
