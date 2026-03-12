import { renderSubtypeAsSingleImage } from './single.js'

export async function renderPlaceholderSubtype(ctx, payload) {
  return await renderSubtypeAsSingleImage(ctx, payload, 'generic')
}
