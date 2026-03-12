/** 功能模块提示（帝江号/地区建设/便签） */
export default [
  {
    component: 'Divider',
    label: '功能模块提示',
  },
  {
    field: 'spaceship.loading',
    label: '帝江号 - 加载中',
    component: 'Input',
  },
  {
    field: 'spaceship.not_found_info',
    label: '帝江号 - 未找到信息',
    component: 'Input',
  },
  {
    field: 'area.loading',
    label: '地区建设 - 加载中',
    component: 'Input',
  },
  {
    field: 'area.not_found_info',
    label: '地区建设 - 未找到信息',
    component: 'Input',
  },
  {
    field: 'area.get_zone_failed',
    label: '地区建设 - 获取地区失败',
    component: 'Input',
  },
  {
    field: 'note.loading',
    label: '便签 - 加载中',
    component: 'Input',
  },
  {
    field: 'note.placeholder',
    label: '便签 - 占位符',
    component: 'Input',
  },
  {
    field: 'note.title',
    label: '便签 - 标题',
    component: 'Input',
  },
  {
    field: 'note.subtitle',
    label: '便签 - 副标题',
    component: 'Input',
  },
  {
    field: 'note.text_base',
    label: '便签 - 基础信息模板',
    component: 'InputTextArea',
    componentProps: {
      rows: 6,
    },
  },
  {
    field: 'note.text_stats',
    label: '便签 - 收集统计模板',
    component: 'InputTextArea',
    componentProps: {
      rows: 5,
    },
  },
  {
    field: 'note.text_owned_header',
    label: '便签 - 已拥有干员标题',
    component: 'Input',
  },
  {
    field: 'note.text_owned_item',
    label: '便签 - 已拥有干员条目',
    component: 'Input',
  },
]
