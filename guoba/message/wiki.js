/** Wiki 查询提示 */
export default [
  {
    component: 'Divider',
    label: 'Wiki 查询提示',
  },
  {
    field: 'wiki.provide_content',
    label: 'Wiki - 请提供查询内容',
    component: 'Input',
  },
  {
    field: 'wiki.query_failed',
    label: 'Wiki - 查询失败',
    component: 'Input',
  },
  {
    field: 'wiki.not_found',
    label: 'Wiki - 未找到',
    component: 'Input',
  },
  {
    field: 'wiki.detail_failed',
    label: 'Wiki - 详情获取失败',
    component: 'Input',
  },
]
