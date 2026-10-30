import type { CharacterState } from '../core/mode';
import { getMode } from '../core/modes';
import { loadGallery, makeId, saveGallery, cloneCharacter, type GalleryItem } from '../core/storage';
import { t } from '../i18n';
import { askConfirm, toast } from './dialog';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Adds the character to the gallery. Returns false if the browser refused to store it. */
export function addToGallery(character: CharacterState, name: string): boolean {
  const items = loadGallery();
  items.unshift({ id: makeId(), name, createdAt: Date.now(), character: cloneCharacter(character) });
  return saveGallery(items);
}

export function nextAutoName(): string {
  return t('gallery.autoName', { n: loadGallery().length + 1 });
}

export function openGallery(onLoad: (item: GalleryItem) => void): void {
  const previous = document.activeElement as HTMLElement | null;
  const overlay = h('div', 'modal-overlay sheet-overlay');
  const sheet = h('div', 'sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'gallery-title');
  overlay.appendChild(sheet);

  const close = (): void => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    previous?.focus?.();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && !document.querySelector('.modal-overlay:not(.sheet-overlay)')) close();
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });

  const head = h('div', 'sheet-head');
  const title = h('h2', 'sheet-title', `💖 ${t('gallery.title')}`);
  title.id = 'gallery-title';
  const closeBtn = h('button', 'btn ghost small', t('gallery.close'));
  closeBtn.type = 'button';
  closeBtn.addEventListener('click', close);
  head.append(title, closeBtn);

  const body = h('div', 'sheet-body');
  sheet.append(head, body);

  const renderList = (): void => {
    const items = loadGallery();
    body.replaceChildren();
    if (items.length === 0) {
      body.appendChild(h('p', 'gallery-empty', t('gallery.empty')));
      return;
    }
    const grid = h('div', 'gallery-grid');
    items.forEach((item) => {
      const mode = getMode(item.character.mode);
      if (!mode) return;
      const card = h('article', 'gallery-card');
      const thumb = h('div', 'thumb');
      // a unique prefix per card keeps gradient / clip-path ids separate on the page
      thumb.innerHTML = mode.render(item.character.params, `gal-${item.id}-`);
      const name = h('div', 'gallery-name', item.name || t('gallery.unnamed'));
      const actions = h('div', 'gallery-actions');
      const load = h('button', 'btn primary small', t('gallery.load'));
      const del = h('button', 'btn ghost small danger-text', t('gallery.delete'));
      load.type = del.type = 'button';
      load.addEventListener('click', () => {
        close();
        onLoad(item);
      });
      del.addEventListener('click', async () => {
        const ok = await askConfirm(t('dialog.confirmDelete', { name: item.name || t('gallery.unnamed') }), t('dialog.confirmDeleteOk'));
        if (!ok) return;
        saveGallery(loadGallery().filter((x) => x.id !== item.id));
        toast(t('toast.deleted'));
        renderList();
      });
      actions.append(load, del);
      card.append(thumb, name, actions);
      grid.appendChild(card);
    });
    body.appendChild(grid);
  };
  renderList();
  document.body.appendChild(overlay);
  closeBtn.focus();
}
