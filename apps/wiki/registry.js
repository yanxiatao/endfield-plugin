import { renderOperatorSubtype } from './operator.js'
import { renderWeaponSubtype } from './weapon.js'
import { renderEquipmentSubtype } from './equipment.js'
import { renderTacticalItemSubtype } from './tactical-item.js'
import { renderPlaceholderSubtype } from './placeholder.js'

const RENDERERS = {
  '1': renderOperatorSubtype,
  '2': renderWeaponSubtype,
  '4': renderEquipmentSubtype,
  '5': renderTacticalItemSubtype,
  '3': renderPlaceholderSubtype,
  '6': renderPlaceholderSubtype,
  '7': renderPlaceholderSubtype,
  '8': renderPlaceholderSubtype,
  '9': renderPlaceholderSubtype
}

export function getWikiSubtypeRenderer(subTypeId) {
  const id = String(subTypeId || '')
  return RENDERERS[id] || renderPlaceholderSubtype
}
