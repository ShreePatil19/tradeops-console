import { kv } from "@vercel/kv";

export { kv };

export type KvLike = Pick<typeof kv, "get" | "set" | "incr" | "expire" | "del">;
