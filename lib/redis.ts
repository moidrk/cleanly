import { createClient } from "redis"

type CleanlyRedisClient = ReturnType<typeof createClient>

const globalForRedis = globalThis as typeof globalThis & {
  cleanlyRedisClient?: CleanlyRedisClient
  cleanlyRedisPromise?: Promise<CleanlyRedisClient | null>
}

function getRedisUrl() {
  return process.env.REDIS_URL?.trim() ?? ""
}

function createRedisClient() {
  const client = createClient({
    url: getRedisUrl(),
  })

  client.on("error", () => {
    // Cache is optional for this app, so connection errors are handled by callers.
  })

  return client
}

export function isRedisConfigured() {
  return Boolean(getRedisUrl())
}

export async function getRedisClient() {
  if (!isRedisConfigured()) return null

  if (globalForRedis.cleanlyRedisClient?.isReady) {
    return globalForRedis.cleanlyRedisClient
  }

  if (!globalForRedis.cleanlyRedisPromise) {
    globalForRedis.cleanlyRedisPromise = (async () => {
      const client = globalForRedis.cleanlyRedisClient ?? createRedisClient()
      globalForRedis.cleanlyRedisClient = client

      if (!client.isOpen) {
        await client.connect()
      }

      return client
    })().catch(() => {
      globalForRedis.cleanlyRedisPromise = undefined
      globalForRedis.cleanlyRedisClient = undefined
      return null
    })
  }

  return globalForRedis.cleanlyRedisPromise
}

export async function getRedisJson<T>(key: string) {
  const client = await getRedisClient()
  if (!client) return null

  try {
    const value = await client.get(key)
    return value ? (JSON.parse(value) as T) : null
  } catch {
    return null
  }
}

export async function setRedisJson<T>(
  key: string,
  value: T,
  ttlSeconds: number
) {
  const client = await getRedisClient()
  if (!client) return false

  try {
    await client.set(key, JSON.stringify(value), {
      EX: ttlSeconds,
    })
    return true
  } catch {
    return false
  }
}

export async function deleteRedisKeys(keys: string[]) {
  if (keys.length === 0) return

  const client = await getRedisClient()
  if (!client) return

  try {
    await client.del(keys)
  } catch {
    // Cache invalidation is best-effort only.
  }
}

export function getEnvTtlSeconds(name: string, fallback: number) {
  const rawValue = process.env[name]
  const parsed = Number.parseInt(rawValue ?? "", 10)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
