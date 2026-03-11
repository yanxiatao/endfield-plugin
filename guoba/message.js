/** 锅巴配置：消息配置（各功能提示文案） */
import base from './message/base.js'
import announcement from './message/announcement.js'
import activity from './message/activity.js'
import wiki from './message/wiki.js'
import operator from './message/operator.js'
import common from './message/common.js'
import feature from './message/feature.js'
import help from './message/help.js'
import stamina from './message/stamina.js'
import attendance from './message/attendance.js'
import gacha from './message/gacha.js'
import enduid from './message/enduid.js'
import strategy from './message/strategy.js'
import bluemap from './message/bluemap.js'
import update from './message/update.js'
import redisClean from './message/redisClean.js'
import gachaSimulate from './message/gachaSimulate.js'
import maaendDevice from './message/maaendDevice.js'
import maaend from './message/maaend.js'

export default function getMessageSchemas() {
  return [
    ...base,
    ...announcement,
    ...activity,
    ...wiki,
    ...operator,
    ...common,
    ...feature,
    ...help,
    ...stamina,
    ...attendance,
    ...gacha,
    ...enduid,
    ...strategy,
    ...bluemap,
    ...update,
    ...redisClean,
    ...gachaSimulate,
    ...maaendDevice,
    ...maaend,
  ]
}
