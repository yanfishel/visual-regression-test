import { Redis } from "ioredis";
import { redisEnvSchema } from "./env.js";

// BullMQ requires maxRetriesPerRequest: null on the connection it's given,
// otherwise its blocking commands (used internally for job polling) throw.
export function createRedisConnection(): Redis {
  const { REDIS_URL } = redisEnvSchema.parse(process.env);
  return new Redis(REDIS_URL, { maxRetriesPerRequest: null });
}
