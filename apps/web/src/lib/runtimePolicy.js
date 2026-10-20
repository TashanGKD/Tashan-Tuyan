export const INPUT_LIMITS = Object.freeze({
  methodContent: 12000,
  caption: 1000,
  negativePrompt: 1000,
  maxCriticRounds: 5,
})

const PREVIEW_ORIGIN = import.meta.env?.VITE_TUYAN_PREVIEW_ORIGIN || ''
if (PREVIEW_ORIGIN && !/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.tashan\.chat$/.test(PREVIEW_ORIGIN)) throw new Error('Invalid preview origin')

const OFFICIAL_API_BASE = 'https://api.paperbanana.asia'
const NEW_WEB_ORIGIN = 'https://tuyansci.cn'
const OFFICIAL_API_ORIGINS = new Set([OFFICIAL_API_BASE, NEW_WEB_ORIGIN])
const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'cancelled'])

export function officialApiBase(origin = '') {
  if (PREVIEW_ORIGIN) return PREVIEW_ORIGIN
  try {
    const parsed = new URL(origin)
    if (parsed.origin === NEW_WEB_ORIGIN) return NEW_WEB_ORIGIN
    const host = parsed.hostname.toLowerCase()
    if (host === 'paperbanana.asia' || host === 'www.paperbanana.asia') return OFFICIAL_API_BASE
  } catch {
    // Production builds still fall back to the pinned official endpoint.
  }
  return OFFICIAL_API_BASE
}

export function validateApiBase(value, allowCustom) {
  if (PREVIEW_ORIGIN) {
    if (String(value || PREVIEW_ORIGIN).replace(/\/$/, '') !== PREVIEW_ORIGIN) throw new Error('Preview API must use its isolated origin')
    return PREVIEW_ORIGIN
  }
  const normalized = String(value || '').trim().replace(/\/$/, '') || OFFICIAL_API_BASE
  const url = new URL(normalized)
  if (!allowCustom && (!OFFICIAL_API_ORIGINS.has(url.origin) || url.username || url.password || url.pathname !== '/' || url.search || url.hash)) {
    throw new Error('Production builds only allow the official PaperBanana API origin.')
  }
  return normalized
}

export function shouldPollJob(job) {
  return !TERMINAL_JOB_STATUSES.has(String(job?.status || '').toLowerCase())
}

export function accountPageUrl(page, origin = globalThis.location?.origin) {
  if (PREVIEW_ORIGIN) return new URL(`/account/${page}`, PREVIEW_ORIGIN).toString()
  const base = origin === NEW_WEB_ORIGIN ? NEW_WEB_ORIGIN : 'https://www.paperbanana.asia'
  return new URL(`/account/${page}`, base).toString()
}
