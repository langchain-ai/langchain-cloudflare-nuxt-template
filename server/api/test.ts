export default defineEventHandler((event) => {
  return {
    'event.context.cloudflare':  event.context.cloudflare,
    'event.context.cloudflare.env.VECTORIZE_INDEX':  event.context.cloudflare.env.VECTORIZE_INDEX,
    'process.env.VECTORIZE_INDEX': process.env.VECTORIZE_INDEX,
    'import.meta.env.VECTORIZE_INDEX': import.meta.env.VECTORIZE_INDEX,
  }
})
