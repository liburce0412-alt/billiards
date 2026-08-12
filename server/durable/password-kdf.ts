import { scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto"
import { DurableObject } from "cloudflare:workers"
import { base64ToBytes, bytesToBase64 } from "../crypto"
import type { PlatformEnv } from "../env"

const COST = 16_384
const BLOCK_SIZE = 8
const PARALLELISM = 1
const KEY_LENGTH = 32

export class PasswordKdf extends DurableObject<PlatformEnv> {
  async hashPassword(password: string, shard: number): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const derived = await deriveKey(password, salt, KEY_LENGTH, {
      N: COST,
      r: BLOCK_SIZE,
      p: PARALLELISM,
      maxmem: 64 * 1024 * 1024,
    })
    return [
      "scrypt",
      "v1",
      String(Math.max(0, Math.min(31, Math.floor(shard)))),
      String(COST),
      String(BLOCK_SIZE),
      String(PARALLELISM),
      bytesToBase64(salt),
      bytesToBase64(new Uint8Array(derived)),
    ].join("$")
  }

  async verifyPassword(password: string, encoded: string): Promise<boolean> {
    const parts = encoded.split("$")
    if (parts.length !== 8 || parts[0] !== "scrypt" || parts[1] !== "v1") {
      return false
    }
    const [, , , costValue, blockValue, parallelValue, saltValue, hashValue] =
      parts
    const cost = Number(costValue)
    const blockSize = Number(blockValue)
    const parallelism = Number(parallelValue)
    if (
      cost !== COST ||
      blockSize !== BLOCK_SIZE ||
      parallelism !== PARALLELISM
    ) {
      return false
    }
    try {
      const salt = base64ToBytes(saltValue)
      const expected = Buffer.from(base64ToBytes(hashValue))
      const actual = await deriveKey(password, salt, expected.length, {
        N: cost,
        r: blockSize,
        p: parallelism,
        maxmem: 64 * 1024 * 1024,
      })
      return (
        actual.length === expected.length && timingSafeEqual(actual, expected)
      )
    } catch {
      return false
    }
  }
}

function deriveKey(
  password: string,
  salt: Uint8Array,
  length: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, options, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}
