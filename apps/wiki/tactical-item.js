import { renderSubtypeAsSplitImages } from './single.js'

export async function renderTacticalItemSubtype(ctx, payload) {
  return await renderSubtypeAsSplitImages(ctx, payload, 'generic', { descriptionTitle: '【战术物品描述】' })
}
