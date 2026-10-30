import { t } from '../i18n';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function openModal(build: (close: (result: unknown) => void, box: HTMLElement) => HTMLElement | null): Promise<unknown> {
  return new Promise((resolve) => {
    const previous = document.activeElement as HTMLElement | null;
    const overlay = el('div', 'modal-overlay');
    const box = el('div', 'modal');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    overlay.appendChild(box);
    const close = (result: unknown): void => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      previous?.focus?.();
      resolve(result);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) close(null);
    });
    const focusEl = build(close, box);
    document.body.appendChild(overlay);
    focusEl?.focus();
  });
}

export async function askText(title: string, placeholder: string, initial: string, okLabel: string): Promise<string | null> {
  const result = await openModal((close, box) => {
    box.appendChild(el('h2', 'modal-title', title));
    const input = el('input', 'text-input');
    input.type = 'text';
    input.maxLength = 40;
    input.placeholder = placeholder;
    input.value = initial;
    input.setAttribute('aria-label', title);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') close(input.value);
    });
    const row = el('div', 'modal-actions');
    const cancel = el('button', 'btn ghost', t('dialog.cancel'));
    const ok = el('button', 'btn primary', okLabel);
    cancel.type = ok.type = 'button';
    cancel.addEventListener('click', () => close(null));
    ok.addEventListener('click', () => close(input.value));
    row.append(cancel, ok);
    box.append(input, row);
    return input;
  });
  return typeof result === 'string' ? result : null;
}

export async function askConfirm(message: string, okLabel: string): Promise<boolean> {
  const result = await openModal((close, box) => {
    box.appendChild(el('p', 'modal-text', message));
    const row = el('div', 'modal-actions');
    const cancel = el('button', 'btn ghost', t('dialog.cancel'));
    const ok = el('button', 'btn danger', okLabel);
    cancel.type = ok.type = 'button';
    cancel.addEventListener('click', () => close(null));
    ok.addEventListener('click', () => close(true));
    row.append(cancel, ok);
    box.appendChild(row);
    return cancel;
  });
  return result === true;
}

let toastTimer: number | undefined;

export function toast(message: string): void {
  let host = document.getElementById('toast');
  if (!host) {
    host = el('div', 'toast');
    host.id = 'toast';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  host.textContent = message;
  host.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => host?.classList.remove('show'), 2400);
}
