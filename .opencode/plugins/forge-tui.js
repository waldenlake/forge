/**
 * Forge TUI plugin for OpenCode.
 *
 * Handles session handoff inside the live TUI process. Real OpenCode testing
 * showed that publishing `session.new` command events over HTTP does not
 * create/switch sessions reliably; the stable path is explicit session
 * creation followed by route navigation and a prompt submitted to that new
 * session.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const HANDOFF_SIGNAL_REL = '.forge/handoff-signal.json';
const RESUME_PROMPT = 'Resume the Forge workflow by running the forge:resume skill.';

function appendDebug(message) {
  try {
    const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
    fs.appendFileSync(
      path.join(home, '.forge-plugin-debug.log'),
      `[${new Date().toISOString()}] ${message}\n`,
    );
  } catch {}
}

function handoffSignalPath(directory) {
  return path.join(directory, HANDOFF_SIGNAL_REL);
}

function readHandoffSignal(directory) {
  const filePath = handoffSignalPath(directory);
  if (!fs.existsSync(filePath)) return null;

  try {
    const signal = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!signal || signal.action !== 'handoff-session') return null;

    const writtenAt = Date.parse(signal.written_at ?? '');
    const ttlMs = typeof signal.ttl_ms === 'number' ? signal.ttl_ms : 30_000;
    if (Number.isFinite(writtenAt) && Date.now() > writtenAt + ttlMs) {
      fs.rmSync(filePath, { force: true });
      appendDebug('OpenCode TUI ignored expired handoff signal');
      return null;
    }

    return signal;
  } catch (err) {
    appendDebug(`OpenCode TUI invalid handoff signal: ${err}`);
    return null;
  }
}

function consumeHandoffSignal(directory) {
  const signal = readHandoffSignal(directory);
  if (!signal) return null;
  fs.rmSync(handoffSignalPath(directory), { force: true });
  return signal;
}

async function resumeInNewSession(api, directory) {
  const signal = consumeHandoffSignal(directory);
  if (!signal) return;

  const progressPath = path.join(directory, '.forge', 'progress.json');
  if (!fs.existsSync(progressPath)) {
    appendDebug('OpenCode TUI skipped handoff: missing .forge/progress.json');
    return;
  }

  try {
    const created = await api.client.session.create({
      directory,
      title: 'Forge handoff',
    });
    const sessionID = created?.data?.id ?? created?.id;
    if (!sessionID) {
      appendDebug(`OpenCode TUI handoff create returned no session id: ${JSON.stringify(created)}`);
      return;
    }

    api.route.navigate('session', { sessionID });
    await api.client.session.promptAsync({
      sessionID,
      directory,
      noReply: false,
      parts: [{ type: 'text', text: RESUME_PROMPT }],
    });
    appendDebug(`OpenCode TUI handoff resumed in session ${sessionID}`);
  } catch (err) {
    appendDebug(`OpenCode TUI handoff error: ${err?.stack || err}`);
  }
}

export default {
  id: 'forge-tui',
  tui: async (api) => {
    const directory = api?.state?.path?.directory;
    if (!directory) return;

    const offIdle = api.event.on('session.idle', async () => {
      await resumeInNewSession(api, directory);
    });

    api.lifecycle.onDispose(() => {
      offIdle();
    });
  },
};
