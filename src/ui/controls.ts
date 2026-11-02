import type { Mode } from '../core/mode';
import type { Category, ChoiceParam, ColorParam, ParamDef, Params, SliderParam, ToggleParam } from '../core/schema';
import { hexToHsv, hsvToHex, type HSV } from '../core/color';
import { t } from '../i18n';
import type { Store } from './store';

interface Row {
  el: HTMLElement;
  def: ParamDef;
  sync(params: Params): void;
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

let uidCounter = 0;
const uid = (p: string): string => `${p}${++uidCounter}`;

function sliderRow(def: SliderParam, store: Store): Row {
  const el = h('div', 'row row-slider');
  const id = uid('sl');
  const head = h('div', 'row-head');
  const label = h('label', 'row-label', t(def.labelKey));
  label.htmlFor = id;
  const value = h('output', 'row-value');
  value.htmlFor = id;
  head.append(label, value);
  const input = h('input', 'range');
  input.type = 'range';
  input.id = id;
  input.min = String(def.min);
  input.max = String(def.max);
  input.step = String(def.step);
  const paint = (): void => {
    const pct = ((Number(input.value) - def.min) / (def.max - def.min)) * 100;
    input.style.setProperty('--fill', `${pct}%`);
    value.textContent = String(Math.round(Number(input.value)));
  };
  input.addEventListener('input', () => {
    paint();
    store.set(def.key, Number(input.value), true);
  });
  input.addEventListener('change', () => store.commit());
  // The native slider grabs every touch, so swiping up or down over it on a phone moved the value
  // instead of scrolling. The input itself ignores the pointer (keyboard still works); this wrapper lets
  // the browser scroll vertically (touch-action: pan-y) and only moves the value on a sideways drag or a tap.
  const wrap = h('div', 'range-wrap');
  wrap.appendChild(input);
  let pointer: { id: number; x: number; y: number; dragging: boolean } | null = null;
  const setFromX = (clientX: number): void => {
    const r = input.getBoundingClientRect();
    const thumb = 28;
    const f = Math.min(1, Math.max(0, (clientX - r.left - thumb / 2) / Math.max(1, r.width - thumb)));
    const raw = def.min + f * (def.max - def.min);
    const v = Math.min(def.max, Math.max(def.min, def.min + Math.round((raw - def.min) / def.step) * def.step));
    if (Number(input.value) === v) return;
    input.value = String(v);
    paint();
    store.set(def.key, v, true);
  };
  const startDrag = (e: PointerEvent): void => {
    if (!pointer) return;
    pointer.dragging = true;
    wrap.setPointerCapture(e.pointerId);
    input.focus({ preventScroll: true });
    setFromX(e.clientX);
  };
  wrap.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || pointer) return;
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false };
    if (e.pointerType === 'mouse') {
      e.preventDefault();
      startDrag(e);
    }
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!pointer || e.pointerId !== pointer.id) return;
    if (pointer.dragging) {
      setFromX(e.clientX);
      return;
    }
    const dx = Math.abs(e.clientX - pointer.x);
    const dy = Math.abs(e.clientY - pointer.y);
    if (dx > 8 && dx > dy) startDrag(e);
    else if (dy > 8) pointer = null; // a vertical swipe: leave it to the page scroll
  });
  wrap.addEventListener('pointerup', (e) => {
    if (!pointer || e.pointerId !== pointer.id) return;
    if (!pointer.dragging) {
      input.focus({ preventScroll: true });
      setFromX(e.clientX); // a plain tap jumps to that spot, like the native slider
    }
    pointer = null;
    store.commit();
  });
  wrap.addEventListener('pointercancel', (e) => {
    if (!pointer || e.pointerId !== pointer.id) return;
    const wasDragging = pointer.dragging;
    pointer = null;
    if (wasDragging) store.commit();
  });
  el.append(head, wrap);
  if (def.minLabelKey || def.maxLabelKey) {
    const ends = h('div', 'range-ends');
    ends.append(h('span', '', def.minLabelKey ? t(def.minLabelKey) : ''), h('span', '', def.maxLabelKey ? t(def.maxLabelKey) : ''));
    el.appendChild(ends);
  }
  return {
    el, def,
    sync(params) {
      input.value = String(params[def.key]);
      paint();
    },
  };
}

function colorRow(def: ColorParam, store: Store): Row {
  const el = h('div', 'row row-color');
  const head = h('div', 'row-head');
  const labelId = uid('cl');
  const label = h('span', 'row-label', t(def.labelKey));
  label.id = labelId;
  head.appendChild(label);
  const swatches = h('div', 'swatches');
  swatches.setAttribute('role', 'group');
  swatches.setAttribute('aria-labelledby', labelId);
  const buttons: HTMLButtonElement[] = [];
  for (const hex of def.palette) {
    const b = h('button', 'swatch');
    b.type = 'button';
    b.style.setProperty('--c', hex);
    b.dataset.color = hex;
    b.setAttribute('aria-label', t('ui.colorSwatch', { hex }));
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => store.set(def.key, hex, false));
    swatches.appendChild(b);
    buttons.push(b);
  }
  let customBtn: HTMLButtonElement | null = null;
  let panel: HTMLElement | null = null;
  let hsv: HSV = { h: 0, s: 0, v: 1 };
  let paintPanel: () => void = () => {};
  if (def.allowCustom) {
    customBtn = h('button', 'swatch custom');
    customBtn.type = 'button';
    customBtn.title = t('ui.colorCustom');
    customBtn.setAttribute('aria-label', t('ui.colorCustom'));
    customBtn.setAttribute('aria-expanded', 'false');
    swatches.appendChild(customBtn);
    panel = h('div', 'color-panel');
    panel.hidden = true;
    const wheel = h('canvas', 'color-wheel');
    const SIZE = 180;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    wheel.width = wheel.height = Math.round(SIZE * dpr);
    wheel.setAttribute('role', 'img');
    wheel.setAttribute('aria-label', t('ui.colorWheel'));
    const marker = h('span', 'color-marker');
    const wheelWrap = h('div', 'color-wheel-wrap');
    wheelWrap.append(wheel, marker);
    const vLabel = h('label', 'row-label', t('ui.colorBrightness'));
    const vId = uid('cv');
    vLabel.htmlFor = vId;
    const vInput = h('input', 'range color-brightness');
    vInput.type = 'range';
    vInput.id = vId;
    vInput.min = '5';
    vInput.max = '100';
    vInput.step = '1';
    panel.append(wheelWrap, vLabel, vInput);
    let drawn = false;
    const drawWheel = (): void => {
      const ctx2 = wheel.getContext('2d');
      if (!ctx2) return;
      const n = wheel.width, c = n / 2;
      const img = ctx2.createImageData(n, n);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const dx = x + 0.5 - c, dy = y + 0.5 - c;
          const d = Math.hypot(dx, dy) / c;
          if (d > 1) continue;
          const hex = hsvToHex({ h: (Math.atan2(dy, dx) * 180) / Math.PI, s: d, v: 1 });
          const i = (y * n + x) * 4;
          img.data[i] = parseInt(hex.slice(1, 3), 16);
          img.data[i + 1] = parseInt(hex.slice(3, 5), 16);
          img.data[i + 2] = parseInt(hex.slice(5, 7), 16);
          img.data[i + 3] = d > 0.99 ? Math.round(255 * (1 - (d - 0.99) / 0.01)) : 255;
        }
      }
      ctx2.putImageData(img, 0, 0);
      drawn = true;
    };
    paintPanel = (): void => {
      if (!drawn) drawWheel();
      const a = (hsv.h * Math.PI) / 180;
      marker.style.left = `${50 + Math.cos(a) * hsv.s * 50}%`;
      marker.style.top = `${50 + Math.sin(a) * hsv.s * 50}%`;
      marker.style.setProperty('--c', hsvToHex({ ...hsv, v: 1 }));
      const full = hsvToHex({ ...hsv, v: 1 });
      vInput.value = String(Math.round(hsv.v * 100));
      vInput.style.setProperty('--vc', full);
    };
    const apply = (live: boolean): void => store.set(def.key, hsvToHex(hsv), live);
    const fromPointer = (e: PointerEvent): void => {
      const r = wheel.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const rad = r.width / 2;
      hsv = { h: (Math.atan2(dy, dx) * 180) / Math.PI, s: Math.min(1, Math.hypot(dx, dy) / rad), v: hsv.v };
      paintPanel();
      apply(true);
    };
    let dragging = false;
    wheelWrap.addEventListener('pointerdown', (e) => {
      dragging = true;
      wheelWrap.setPointerCapture(e.pointerId);
      fromPointer(e);
    });
    wheelWrap.addEventListener('pointermove', (e) => { if (dragging) fromPointer(e); });
    const end = (): void => {
      if (!dragging) return;
      dragging = false;
      store.commit();
    };
    wheelWrap.addEventListener('pointerup', end);
    wheelWrap.addEventListener('pointercancel', end);
    vInput.addEventListener('input', () => {
      hsv = { ...hsv, v: Number(vInput.value) / 100 };
      paintPanel();
      apply(true);
    });
    vInput.addEventListener('change', () => store.commit());
    customBtn.addEventListener('click', () => {
      const open = panel!.hidden;
      panel!.hidden = !open;
      customBtn!.setAttribute('aria-expanded', String(open));
      if (open) paintPanel();
    });
  }
  el.append(head, swatches);
  if (panel) el.appendChild(panel);
  return {
    el, def,
    sync(params) {
      const cur = String(params[def.key]).toLowerCase();
      let inPalette = false;
      for (const b of buttons) {
        const on = b.dataset.color!.toLowerCase() === cur;
        inPalette ||= on;
        b.classList.toggle('selected', on);
        b.setAttribute('aria-pressed', String(on));
      }
      if (customBtn) {
        // keep the hue of a grey / black colour while the wheel is being used
        if (hsvToHex(hsv).toLowerCase() !== cur) hsv = hexToHsv(cur);
        customBtn.classList.toggle('selected', !inPalette);
        customBtn.style.setProperty('--c', !inPalette ? cur : 'transparent');
        if (panel && !panel.hidden) paintPanel();
      }
    },
  };
}

function choiceRow(def: ChoiceParam, store: Store): Row {
  const el = h('div', 'row row-choice');
  const labelId = uid('ch');
  const head = h('div', 'row-head');
  const label = h('span', 'row-label', t(def.labelKey));
  label.id = labelId;
  head.appendChild(label);
  const chips = h('div', 'chips');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-labelledby', labelId);
  const buttons: HTMLButtonElement[] = [];
  for (const o of def.options) {
    const b = h('button', 'chip', t(o.labelKey));
    b.type = 'button';
    b.dataset.value = o.value;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => store.set(def.key, o.value, false));
    chips.appendChild(b);
    buttons.push(b);
  }
  el.append(head, chips);
  return {
    el, def,
    sync(params) {
      for (const b of buttons) {
        const on = b.dataset.value === params[def.key];
        b.classList.toggle('selected', on);
        b.setAttribute('aria-pressed', String(on));
      }
    },
  };
}

function toggleRow(def: ToggleParam, store: Store): Row {
  const el = h('div', 'row row-toggle');
  const id = uid('tg');
  const label = h('label', 'switch');
  label.htmlFor = id;
  const input = h('input', 'switch-input');
  input.type = 'checkbox';
  input.id = id;
  input.setAttribute('role', 'switch');
  const track = h('span', 'switch-track');
  const text = h('span', 'row-label', t(def.labelKey));
  input.addEventListener('change', () => store.set(def.key, input.checked, false));
  label.append(input, track, text);
  el.appendChild(label);
  return {
    el, def,
    sync(params) {
      input.checked = params[def.key] === true;
    },
  };
}

function buildRow(def: ParamDef, store: Store): Row {
  switch (def.type) {
    case 'slider': return sliderRow(def, store);
    case 'color': return colorRow(def, store);
    case 'choice': return choiceRow(def, store);
    case 'toggle': return toggleRow(def, store);
  }
}

export interface ControlsHandle {
  el: HTMLElement;
  /** Bring every control in line with the current parameters. */
  sync(): void;
}

/** Builds the tabbed controls panel from a mode's parameter schema. */
export function buildControls(mode: Mode, store: Store, initialTab: string, onTab: (id: string) => void): ControlsHandle {
  const root = h('div', 'controls');
  const tabs = h('div', 'tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', t('panel.tabs'));
  const panels = h('div', 'panels');
  const rows: Row[] = [];
  const tabButtons = new Map<string, HTMLButtonElement>();
  const panelEls = new Map<string, HTMLElement>();

  const select = (id: string, focus = false): void => {
    for (const [cid, btn] of tabButtons) {
      const on = cid === id;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
      panelEls.get(cid)!.hidden = !on;
      if (on && focus) btn.focus();
    }
    onTab(id);
  };

  const first = mode.categories.some((c) => c.id === initialTab) ? initialTab : mode.categories[0].id;
  mode.categories.forEach((cat: Category, idx) => {
    const btn = h('button', 'tab');
    btn.type = 'button';
    btn.id = `tab-${cat.id}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', `panel-${cat.id}`);
    btn.append(h('span', 'tab-icon', cat.icon), h('span', 'tab-label', t(cat.labelKey)));
    btn.addEventListener('click', () => select(cat.id));
    btn.addEventListener('keydown', (e) => {
      const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      const next = mode.categories[(idx + dir + mode.categories.length) % mode.categories.length];
      select(next.id, true);
    });
    tabs.appendChild(btn);
    tabButtons.set(cat.id, btn);

    const panel = h('div', 'panel-body');
    panel.id = `panel-${cat.id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', btn.id);
    for (const def of cat.params) {
      const row = buildRow(def, store);
      rows.push(row);
      panel.appendChild(row.el);
    }
    panels.appendChild(panel);
    panelEls.set(cat.id, panel);
  });

  root.append(tabs, panels);
  select(first);

  return {
    el: root,
    sync() {
      const params = store.character.params;
      for (const row of rows) {
        row.sync(params);
        row.el.hidden = row.def.showIf ? !row.def.showIf(params) : false;
      }
    },
  };
}
