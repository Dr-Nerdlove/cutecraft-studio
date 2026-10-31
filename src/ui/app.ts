import { downloadBlob, safeFileName, svgToPngBlob } from '../core/exportPng';
import type { Mode, ViewKind } from '../core/mode';
import { defaultMode, getMode, modes } from '../core/modes';
import { VIEW_KEY, loadCurrent, newCharacter, storageGet, storageSet } from '../core/storage';
import { onLangChange, t, type Key } from '../i18n';
import { getTheme, onThemeChange, toggleTheme } from './theme';
import { buildControls, type ControlsHandle } from './controls';
import { askConfirm, askText, toast } from './dialog';
import { addToGallery, nextAutoName, openGallery } from './gallery';
import { openFeedback } from './feedback';
import { Store } from './store';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const LOGO = `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9ec7"/><stop offset="1" stop-color="#b79cff"/></linearGradient></defs><path d="M24 43C8 33 3 24 3 16.5 3 10 8 6 13.5 6c4.2 0 8 2.6 10.5 6.3C26.500 8.600 30.300 6 34.500 6 40 6 45 10 45 16.500 45 24 40 33 24 43Z" fill="url(#lg)"/><ellipse cx="17" cy="22" rx="3" ry="4" fill="#fff"/><ellipse cx="31" cy="22" rx="3" ry="4" fill="#fff"/><circle cx="17.800" cy="21" r="1.300" fill="#5a3f8a"/><circle cx="31.800" cy="21" r="1.300" fill="#5a3f8a"/><path d="M21 28.500q3 3 6 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`;

interface Tool {
  id: string;
  icon: string;
  labelKey: Key;
  primary?: boolean;
  run: () => void;
}

export function mountApp(root: HTMLElement): void {
  const store = new Store(loadCurrent() ?? newCharacter(defaultMode.id));
  let activeTab = 'body';
  let controls: ControlsHandle | null = null;
  let preview: HTMLElement | null = null;
  let undoBtn: HTMLButtonElement | null = null;
  let redoBtn: HTMLButtonElement | null = null;
  let frame = 0;
  let view: ViewKind = storageGet(VIEW_KEY) === 'portrait' ? 'portrait' : 'full';
  let viewBtn: HTMLButtonElement | null = null;
  let themeBtn: HTMLButtonElement | null = null;

  const currentMode = (): Mode => getMode(store.character.mode) ?? defaultMode;

  function drawPreview(): void {
    frame = 0;
    if (!preview) return;
    preview.innerHTML = currentMode().render(store.character.params, 'pv-', view);
  }

  function syncViewButton(): void {
    if (!viewBtn) return;
    const label = t(view === 'portrait' ? 'view.full' : 'view.portrait');
    viewBtn.title = label;
    viewBtn.setAttribute('aria-label', label);
    viewBtn.setAttribute('aria-pressed', String(view === 'portrait'));
    viewBtn.textContent = view === 'portrait' ? '🧍' : '🔍';
  }

  function toggleView(): void {
    view = view === 'portrait' ? 'full' : 'portrait';
    storageSet(VIEW_KEY, view);
    syncViewButton();
    drawPreview();
  }

  function schedulePreview(): void {
    if (!frame) frame = requestAnimationFrame(drawPreview);
  }

  function syncHistoryButtons(): void {
    if (undoBtn) undoBtn.disabled = !store.canUndo;
    if (redoBtn) redoBtn.disabled = !store.canRedo;
  }

  store.subscribe((kind) => {
    schedulePreview();
    if (kind !== 'live') controls?.sync();
    syncHistoryButtons();
  });

  async function save(): Promise<void> {
    const name = await askText(t('dialog.saveTitle'), t('dialog.namePlaceholder'), store.name || nextAutoName(), t('dialog.ok'));
    if (name === null) return;
    const finalName = name.trim() || nextAutoName();
    if (addToGallery(store.character, finalName)) {
      store.name = finalName;
      toast(t('toast.saved'));
    } else {
      toast(t('toast.saveFailed'));
    }
  }

  async function reset(): Promise<void> {
    if (!(await askConfirm(t('dialog.confirmReset'), t('dialog.confirmResetOk')))) return;
    store.replace(newCharacter(store.character.mode));
    toast(t('toast.reset'));
  }

  async function exportPng(): Promise<void> {
    try {
      const svg = currentMode().render(store.character.params, 'exp-', view);
      const blob = await svgToPngBlob(svg, 400, 600, 2);
      downloadBlob(blob, `cutecraft-${safeFileName(store.name)}.png`);
      toast(t('toast.exported'));
    } catch {
      toast(t('toast.exportFailed'));
    }
  }

  function feedback(): Promise<void> {
    return openFeedback({
      settingsCode: () => JSON.stringify(store.character),
      png: () => svgToPngBlob(currentMode().render(store.character.params, 'fb-', view), 400, 600, 2),
    });
  }

  const tools: Tool[] = [
    { id: 'random', icon: '🎲', labelKey: 'tool.random', primary: true, run: () => store.replace({ ...store.character, params: currentMode().randomize() }) },
    { id: 'undo', icon: '↩️', labelKey: 'tool.undo', run: () => store.undo() },
    { id: 'redo', icon: '↪️', labelKey: 'tool.redo', run: () => store.redo() },
    { id: 'reset', icon: '🔄', labelKey: 'tool.reset', run: () => void reset() },
    { id: 'save', icon: '💖', labelKey: 'tool.save', primary: true, run: () => void save() },
    {
      id: 'gallery', icon: '🖼️', labelKey: 'tool.gallery', primary: true,
      run: () => openGallery((item) => { store.replace(item.character, item.name); toast(t('toast.loaded')); }),
    },
    { id: 'export', icon: '📥', labelKey: 'tool.export', run: () => void exportPng() },
  ];

  // Colours are CSS variables, so a theme change only needs the header button updated, not a rebuild.
  function updateThemeBtn(): void {
    if (!themeBtn) return;
    const toDark = getTheme() === 'light';
    themeBtn.textContent = toDark ? '🌙' : '☀️';
    themeBtn.setAttribute('aria-label', t(toDark ? 'header.dark' : 'header.light'));
    themeBtn.title = t(toDark ? 'header.dark' : 'header.light');
  }

  function build(): void {
    document.title = t('app.title');
    root.replaceChildren();
    const app = h('div', 'app');

    // header
    const header = h('header', 'topbar');
    const brand = h('div', 'brand');
    const logo = h('span', 'logo');
    logo.innerHTML = LOGO;
    const titles = h('div', 'brand-text');
    titles.append(h('h1', 'title', t('app.title')), h('p', 'tagline', t('app.tagline')));
    brand.append(logo, titles);

    const actions = h('div', 'topbar-actions');
    const modeWrap = h('label', 'mode-select');
    modeWrap.append(h('span', 'sr-only', t('header.mode')));
    const select = h('select', 'select');
    for (const m of modes) {
      const o = h('option', '', t(m.nameKey));
      o.value = m.id;
      o.selected = m.id === store.character.mode;
      select.appendChild(o);
    }
    select.addEventListener('change', () => {
      if (select.value !== store.character.mode) store.replace(newCharacter(select.value));
    });
    modeWrap.appendChild(select);

    themeBtn = h('button', 'theme-btn');
    themeBtn.type = 'button';
    themeBtn.addEventListener('click', toggleTheme);
    updateThemeBtn();
    const feedbackBtn = h('button', 'feedback-btn');
    feedbackBtn.type = 'button';
    feedbackBtn.title = t('header.feedback');
    feedbackBtn.append(h('span', 'feedback-icon', '💌'), h('span', 'feedback-label', t('header.feedback')));
    feedbackBtn.addEventListener('click', () => void feedback());
    actions.append(modeWrap, feedbackBtn, themeBtn);
    header.append(brand, actions);

    // stage: preview + tools
    const stage = h('section', 'stage');
    const card = h('div', 'preview-card');
    preview = h('div', 'preview');
    preview.setAttribute('role', 'img');
    preview.setAttribute('aria-label', t('preview.label'));
    viewBtn = h('button', 'view-btn');
    viewBtn.type = 'button';
    viewBtn.addEventListener('click', toggleView);
    card.append(preview, viewBtn);
    syncViewButton();
    const bar = h('div', 'toolbar');
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', t('tool.toolbar'));
    for (const tool of tools) {
      const b = h('button', `tool tool-${tool.id}${tool.primary ? ' primary' : ''}`);
      b.type = 'button';
      b.title = t(tool.labelKey);
      b.setAttribute('aria-label', t(tool.labelKey));
      b.append(h('span', 'tool-icon', tool.icon), h('span', 'tool-label', t(tool.labelKey)));
      b.addEventListener('click', tool.run);
      if (tool.id === 'undo') undoBtn = b;
      if (tool.id === 'redo') redoBtn = b;
      bar.appendChild(b);
    }
    stage.append(card, bar);

    // panel
    const panel = h('section', 'panel');
    controls = buildControls(currentMode(), store, activeTab, (id) => { activeTab = id; });
    panel.appendChild(controls.el);

    const main = h('main', 'layout');
    main.append(stage, panel);
    app.append(header, main);
    root.appendChild(app);

    controls.sync();
    syncHistoryButtons();
    drawPreview();
  }

  onLangChange(build);
  onThemeChange(updateThemeBtn);

  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text')) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); store.redo(); }
  });

  build();
}
