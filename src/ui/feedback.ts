import { downloadBlob } from '../core/exportPng';
import { getLang, t } from '../i18n';
import { el, openModal, toast } from './dialog';

export interface FeedbackSource {
  /** Compact, pasteable text that restores the current character. */
  settingsCode: () => string;
  /** PNG of the current character. */
  png: () => Promise<Blob>;
}

const APP_NAME = 'CuteCraft Studio';

function buildMessage(text: string, settingsCode: string): string {
  return [
    text.trim(),
    '',
    '---',
    `App: ${APP_NAME} (${location.host || 'local'})`,
    `Date: ${new Date().toISOString()}`,
    `Language: ${getLang()}`,
    `Device: ${navigator.userAgent.slice(0, 100)}`,
    'Settings code (paste it to restore this character):',
    settingsCode,
  ].join('\n');
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

/**
 * Shares the message through the system share menu. Returns 'cancelled' when the user closed the menu,
 * otherwise 'shared' or 'fallback' (text copied, picture downloaded).
 */
async function deliver(message: string, png: File): Promise<'shared' | 'cancelled' | 'fallback'> {
  const title = `${APP_NAME} - Feedback`;
  if (typeof navigator.share === 'function') {
    try {
      if (navigator.canShare?.({ files: [png] })) {
        await navigator.share({ title, text: message, files: [png] });
      } else {
        await navigator.share({ title, text: message });
        downloadBlob(png, png.name);
      }
      return 'shared';
    } catch (e) {
      if (isAbort(e)) return 'cancelled';
      // any other error: fall through to the copy + download path
    }
  }
  await copyText(message);
  downloadBlob(png, png.name);
  return 'fallback';
}

/** Opens the feedback dialog. Resolves when the dialog is closed. */
export async function openFeedback(source: FeedbackSource): Promise<void> {
  await openModal((close, box) => {
    box.appendChild(el('h2', 'modal-title', t('feedback.title')));
    const area = el('textarea', 'text-area');
    area.rows = 5;
    area.maxLength = 2000;
    area.placeholder = t('feedback.placeholder');
    area.setAttribute('aria-label', t('feedback.title'));
    const hint = el('p', 'modal-hint', t('feedback.hint'));
    const row = el('div', 'modal-actions');
    const cancel = el('button', 'btn ghost', t('dialog.cancel'));
    const send = el('button', 'btn primary', t('feedback.send'));
    cancel.type = send.type = 'button';
    send.disabled = true;
    area.addEventListener('input', () => {
      send.disabled = area.value.trim() === '';
    });
    cancel.addEventListener('click', () => close(null));
    send.addEventListener('click', async () => {
      if (send.disabled) return;
      send.disabled = cancel.disabled = true;
      send.textContent = t('feedback.sending');
      try {
        const blob = await source.png();
        const file = new File([blob], 'cutecraft-feedback.png', { type: 'image/png' });
        const result = await deliver(buildMessage(area.value, source.settingsCode()), file);
        if (result === 'cancelled') return; // keep the dialog and the text
        close(true);
        toast(t(result === 'shared' ? 'feedback.thanks' : 'feedback.copied'));
      } catch {
        toast(t('feedback.failed'));
      } finally {
        send.textContent = t('feedback.send');
        cancel.disabled = false;
        send.disabled = area.value.trim() === '';
      }
    });
    row.append(cancel, send);
    box.append(area, hint, row);
    return area;
  });
}
