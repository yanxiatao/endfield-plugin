/** MaaEnd 设备管理提示 */
export default [
  {
    component: 'Divider',
    label: 'MaaEnd 设备管理',
  },
  {
    field: 'maaend_device.current_default',
    label: 'MaaEnd - 当前默认设备',
    component: 'Input',
  },
  {
    field: 'maaend_device.set_default_ok',
    label: 'MaaEnd - 设置默认设备成功',
    component: 'InputTextArea',
    componentProps: {
      rows: 4,
    },
  },
]
