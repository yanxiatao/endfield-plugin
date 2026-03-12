import { renderSubtypeAsSplitImages } from './single.js'

export async function renderWeaponSubtype(ctx, payload) {
  return await renderSubtypeAsSplitImages(ctx, payload, 'weapon', { descriptionTitle: '【武器描述】' })
}
