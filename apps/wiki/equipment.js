import { renderSubtypeAsSplitImages } from './single.js'

export async function renderEquipmentSubtype(ctx, payload) {
  return await renderSubtypeAsSplitImages(ctx, payload, 'generic', { descriptionTitle: '【装备描述】' })
}
