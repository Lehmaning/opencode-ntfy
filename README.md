# opencode-ntfy

Push ntfy.sh notifications for OpenCode events.

Sends push notifications to your phone when OpenCode completes a session, errors, asks questions, or needs permission. Supports bidirectional remote messaging via per-session reply topics.

## Install

```json
// opencode.json
{
  "plugin": ["file:///path/to/opencode-ntfy/.opencode/plugins/ntfy.ts"]
}
```

Or copy `ntfy.ts` to `~/.config/opencode/plugins/`.

## Configure

```json
// ~/.config/opencode/ntfy-config.json
{
  "serverUrl": "https://ntfy.sh",
  "topic": "your-unique-topic",
  "notifyOnIdle": true,
  "notifyOnError": true,
  "notifyOnQuestion": true
}
```

1. Install the ntfy app on your phone
2. Subscribe to your topic
3. Restart OpenCode

## Events

| Event | Title | Description |
|-------|-------|-------------|
| Session complete | Session done | Session became idle |
| Session error | Session error | Session encountered an error |
| Question asked | Question for you | AI is waiting for input |
| Permission asked | Permission needed | AI needs approval |

## Reply

Each session gets a unique reply topic. When a session completes, the notification includes a reply URL. Post a message there to inject it back into the session:

```bash
curl -d "your message" https://ntfy.sh/<reply-topic>
```

The plugin polls reply topics every 10 seconds and forwards messages via `client.session.prompt()`.

## Config

| Key | Default | Description |
|-----|---------|-------------|
| serverUrl | https://ntfy.sh | ntfy server |
| topic | (required) | Notification topic |
| auth | "" | Basic auth for ntfy |
| notifyOnIdle | true | Notify on session complete |
| notifyOnError | true | Notify on session error |
| notifyOnQuestion | true | Notify on questions |
| subscribe.enabled | false | Enable reply polling |

## Files

```
~/.config/opencode/
  plugins/ntfy.ts        # plugin
  ntfy-config.json       # config (not in repo)
```
