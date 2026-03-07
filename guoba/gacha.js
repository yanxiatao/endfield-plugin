/** 锅巴配置：模拟抽卡配置（需 groupList 用于群白名单） */
export default function getGachaSchemas(groupList) {
  return [
    {
      label: '抽卡配置',
      component: 'SOFT_GROUP_BEGIN'
    },
    {
      component: 'Divider',
      label: '卡池信息来源',
    },
    {
      field: 'gacha.banner_info.source',
      label: '卡池信息数据源',
      bottomHelpMessage: 'backend_api：后端 bili_wiki_activities；local_file：本地 data/game_banners.yaml',
      component: 'Select',
      componentProps: {
        options: [
          { label: '后端 API（bili_wiki_activities）', value: 'backend_api' },
          { label: '本地文件（game_banners.yaml）', value: 'local_file' },
        ],
        placeholder: '请选择卡池信息来源',
      },
    },
    {
      component: 'Divider',
      label: '模拟抽卡配置',
    },
    {
      field: 'gacha.simulate.enable',
      label: '模拟抽卡功能开关',
      bottomHelpMessage: '关闭后所有人无法使用 :单抽 / :十连 / :模拟抽卡；好友仅受此开关影响',
      component: 'Switch',
    },
    {
      field: 'gacha.simulate.group_whitelist',
      label: '模拟抽卡群聊白名单',
      bottomHelpMessage: '不填则所有群可用；仅影响群聊，好友不受白名单限制',
      component: 'Select',
      componentProps: {
        allowAdd: true,
        allowDel: true,
        mode: 'multiple',
        options: groupList,
        placeholder: '选择允许使用模拟抽卡的群（不选=不限制）',
      },
    },
    {
      field: 'gacha.simulate.daily_limit.limited',
      label: '限定池每日使用次数',
      bottomHelpMessage: '单抽/十连/模拟抽卡均计 1 次；0 表示不限制',
      component: 'InputNumber',
      componentProps: { min: 0, placeholder: '0 不限制' },
    },
    {
      field: 'gacha.simulate.daily_limit.standard',
      label: '常驻池每日使用次数',
      bottomHelpMessage: '0 表示不限制',
      component: 'InputNumber',
      componentProps: { min: 0, placeholder: '0 不限制' },
    },
    {
      field: 'gacha.simulate.daily_limit.weapon',
      label: '武器池每日使用次数',
      bottomHelpMessage: '0 表示不限制',
      component: 'InputNumber',
      componentProps: { min: 0, placeholder: '0 不限制' },
    },
  ]
}
