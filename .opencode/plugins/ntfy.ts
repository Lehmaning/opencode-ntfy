import type { Plugin } from "@opencode-ai/plugin"
import { readFile } from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"

const VERSION = "3.1.0"

async function loadConfig() {
  const def = { serverUrl: "https://ntfy.sh", topic: "", auth: "", notifyOnIdle: true, notifyOnError: true, notifyOnQuestion: true }
  try {
    const raw = await readFile(path.join(os.homedir(), ".config", "opencode", "ntfy-config.json"), "utf8")
    return Object.assign(def, JSON.parse(raw))
  } catch { return def }
}

const plugin: Plugin = async ({ client }) => {
  const cfg = await loadConfig()
  if (!cfg.topic) { console.log("[ntfy] no topic"); return {} }

  const DEDUP_MS = 5000
  const notified = new Map()
  const replies = new Map()

  if (cfg.subscribe?.enabled) {
    setInterval(async () => {
      if (replies.size === 0) return
      const topics = [...replies.keys()].join(",")
      let minTime = 0
      for (const e of replies.values()) { if (e.lastTime && (!minTime || e.lastTime < minTime)) minTime = e.lastTime }
      try {
        const res = await fetch(cfg.serverUrl + "/" + topics + "/json?poll=1&since=" + (minTime || "all"))
        const text = await res.text()
        for (const line of text.trim().split("\n")) {
          try {
            const msg = JSON.parse(line)
            if (msg.event !== "message" || !msg.message) continue
            const entry = replies.get(msg.topic)
            if (!entry || msg.time <= entry.lastTime) continue
            entry.lastTime = msg.time
            await client.session.prompt({ path: { id: entry.sessionId }, body: { parts: [{ type: "text", text: "[ntfy] " + msg.message }] } })
          } catch {}
        }
      } catch {}
    }, 10000)
  }

  async function send(title, msg, tags, prio) {
    try {
      const h = { "X-Title": title, "X-Priority": String(prio || 3), "X-Tags": (tags || []).join(",") }
      if (cfg.auth) h["Authorization"] = "Basic " + Buffer.from(cfg.auth).toString("base64")
      await fetch(cfg.serverUrl + "/" + cfg.topic, { method: "POST", body: msg, headers: h })
    } catch (e) { console.log("[ntfy] send error:", String(e)) }
  }

  function getSid(ev) {
    return ev?.properties?.sessionID || ev?.properties?.info?.id || ""
  }

  function buildReplyHint(sid) {
    for (const [t, e] of replies) { if (e.sessionId === sid) return "\nReply: " + cfg.serverUrl + "/" + t }
    return ""
  }

  return {
    event: async ({ event }) => {
      const type = event?.type
      const id = getSid(event)

      // Track sessions for reply topics
      if (type === "session.created" && id) {
        replies.set(crypto.randomUUID(), { sessionId: id, lastTime: 0 })
        return
      }
      if (type === "session.deleted" && id) {
        for (const [t, e] of replies) { if (e.sessionId === id) replies.delete(t) }
        return
      }

      // Dedup
      if (id) {
        const last = notified.get(id)
        if (last && Date.now() - last < DEDUP_MS) return
        notified.set(id, Date.now())
        for (const [k, v] of notified) { if (Date.now() - v > 60000) notified.delete(k) }
      }

      // Only compute reply hint when we're about to send a notification
      let replyHint = ""

      // session.status idle (official way to detect completion)
      if (type === "session.status" && cfg.notifyOnIdle && id && event?.properties?.status?.type === "idle") {
        replyHint = buildReplyHint(id)
        await send("Session done", "Session " + id.slice(0,12) + replyHint, ["white_check_mark"], "default")
      }

      // session.error
      if (type === "session.error" && cfg.notifyOnError && id) {
        replyHint = buildReplyHint(id)
        await send("Session error", "Session " + id.slice(0,12) + replyHint, ["rotating_light"], "high")
      }

      // question/permission
      if (type === "question.asked" && cfg.notifyOnQuestion) {
        replyHint = buildReplyHint(id)
        await send("Question for you", "OpenCode needs input" + replyHint, ["question"], "high")
      }
      if (type === "permission.asked") {
        replyHint = buildReplyHint(id)
        await send("Permission needed", "OpenCode needs input" + replyHint, ["warning"], "high")
      }
    },
  }
}

export default plugin
