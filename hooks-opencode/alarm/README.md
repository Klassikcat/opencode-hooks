# OpenCode Telegram alarm hook

Telegram notifications for local OpenCode server events.

## What it sends

- `session.idle` after an active step: completed alert
- `session.next.step.failed`: failed or aborted alert
- `session.error`: failed or aborted alert
- `session.next.step.ended` with abort/cancel finish: aborted alert
- `question.asked`: question waiting alert with the first question and option labels

Subagent session lifecycle alerts are ignored by default. Set `OPENCODE_TELEGRAM_NOTIFY_SUBAGENTS=true` to include them.

## Install

1. Copy `index.js` somewhere stable, for example:

   ```bash
   mkdir -p ~/.config/opencode/hooks/alarm
   cp index.js ~/.config/opencode/hooks/alarm/index.js
   ```

2. Add the plugin path to `~/.config/opencode/opencode.json`:

   ```json
   {
     "plugin": [
       "/home/you/.config/opencode/hooks/alarm/index.js"
     ]
   }
   ```

3. Create `~/.config/opencode/telegram-notifier.env` from `.env.example` and fill in real values. Do not commit this file.

4. If OpenCode runs under `systemd --user`, add the drop-in from `systemd-dropin.conf`:

   ```bash
   mkdir -p ~/.config/systemd/user/opencode-server.service.d
   cp systemd-dropin.conf ~/.config/systemd/user/opencode-server.service.d/telegram-notifier.conf
   systemctl --user daemon-reload
   systemctl --user restart opencode-server
   ```

## Verify

Run the local smoke test without sending a real Telegram message:

```bash
npm run check
```

To manually verify live delivery, start OpenCode with the plugin configured and use a `question` tool call. Telegram should receive `❓ OpenCode question waiting`.
