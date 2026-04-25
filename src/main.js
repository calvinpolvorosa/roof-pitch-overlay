import {
  updateIndicator, updateReadout,
  setArcOpacity, setProtractorRotation,
  CX, CY, R, DEFAULT_ANGLE, pitchToAngle,
} from './protractor.js';

import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalPosition, LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { load } from '@tauri-apps/plugin-store';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { open as shellOpen } from '@tauri-apps/plugin-shell';

// ── State ─────────────────────────────────────────────────────────────────────
//
// indicatorAngle: full semicircle in [0, π] rad.
//   0     = far right (0/12), π/2 = vertical (>24/12), π = far left (0/12).
//   Stored and restored between sessions.

const state = {
  indicatorAngle: DEFAULT_ANGLE,  // ≈ 6/12 right side
  rotation:       0,
  opacity:        30,
  settingsOpen:   false,
};

let store;
const win = getCurrentWindow();

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  store = await load('config.json', { autoSave: false });

  const savedAngle    = await store.get('indicatorAngle');
  const savedRotation = await store.get('rotation');
  const savedOpacity  = await store.get('opacity');
  const savedX        = await store.get('windowX');
  const savedY        = await store.get('windowY');
  const savedW        = await store.get('windowW');
  const savedH        = await store.get('windowH');

  if (savedAngle    != null) state.indicatorAngle = savedAngle;
  if (savedRotation != null) state.rotation       = savedRotation;
  if (savedOpacity  != null) state.opacity        = savedOpacity;

  if (savedX != null && savedY != null)
    await win.setPosition(new LogicalPosition(savedX, savedY));
  if (savedW != null && savedH != null)
    await win.setSize(new LogicalSize(savedW, savedH));

  updateIndicator(state.indicatorAngle);
  updateReadout(state.indicatorAngle);
  setProtractorRotation(state.rotation);
  setArcOpacity(state.opacity / 100);

  document.getElementById('opacity-slider').value = state.opacity;

  // Load autostart state into settings toggle
  try {
    const autostartOn = await invoke('get_autostart');
    document.getElementById('toggle-autostart').checked = autostartOn;
  } catch (e) {
    console.error('get_autostart:', e);
  }

  wireControls();
  await listen('toggle-visibility', () => handleToggleVisibility());

  setTimeout(checkForUpdates, 3000);
}

// ── Update check ─────────────────────────────────────────────────────────────

async function checkForUpdates() {
  try {
    const update = await check();
    if (!update?.available) return;
    const dlg = document.getElementById('update-dialog');
    document.getElementById('update-version-text').textContent =
      `Version ${update.version} is available`;
    dlg.classList.remove('hidden');

    document.getElementById('btn-update-install').onclick = async () => {
      dlg.classList.add('hidden');
      try {
        await update.downloadAndInstall();
        await relaunch();
      } catch (e) {
        console.error('Auto-update failed:', e);
        await shellOpen('https://example.com/pitch-gauge');
      }
    };

    document.getElementById('btn-update-later').onclick = () => {
      dlg.classList.add('hidden');
    };
  } catch (e) {
    console.error('Update check failed:', e);
  }
}

// ── Config persistence ────────────────────────────────────────────────────────

async function saveConfig() {
  try {
    const pos  = await win.outerPosition();
    const size = await win.outerSize();
    const dpr  = window.devicePixelRatio || 1;

    await store.set('indicatorAngle', state.indicatorAngle);
    await store.set('rotation',  state.rotation);
    await store.set('opacity',   state.opacity);
    await store.set('windowX',   pos.x  / dpr);
    await store.set('windowY',   pos.y  / dpr);
    await store.set('windowW',   size.width  / dpr);
    await store.set('windowH',   size.height / dpr);
    await store.save();
  } catch (e) {
    console.error('saveConfig:', e);
  }
}

// ── Visibility toggle ─────────────────────────────────────────────────────────

async function handleToggleVisibility() {
  const visible = await win.isVisible();
  if (visible) {
    await win.hide();
  } else {
    await win.show();
    await win.setFocus();
  }
}

// ── Settings panel ────────────────────────────────────────────────────────────

function openSettings() {
  state.settingsOpen = true;
  document.getElementById('settings-panel').classList.remove('hidden');
}

function closeSettings() {
  state.settingsOpen = false;
  document.getElementById('settings-panel').classList.add('hidden');
}

// ── Indicator drag ─────────────────────────────────────────────────────────────

function startIndicatorDrag(e) {
  e.preventDefault();
  e.stopPropagation();

  const svg = document.getElementById('protractor-svg');

  function getAngleFromEvent(evt) {
    const rect   = svg.getBoundingClientRect();
    const scaleX = 560 / rect.width;
    const scaleY = 390 / rect.height;

    // Cursor in SVG viewBox coordinates
    const svgX = (evt.clientX - rect.left) * scaleX;
    const svgY = (evt.clientY - rect.top)  * scaleY;

    // Vector from vertex in math coords (y-up)
    const dx = svgX - CX;
    const dy = CY - svgY;

    // Un-rotate cursor into protractor frame so angle matches the tilt
    const rotRad = state.rotation * Math.PI / 180;
    const uDx =  dx * Math.cos(rotRad) + dy * Math.sin(rotRad);
    const uDy = -dx * Math.sin(rotRad) + dy * Math.cos(rotRad);

    // Ignore drags well below the baseline
    if (uDy < -40) return null;

    // atan2 with dy clamped to ≥0 gives angle in [0, π], covering the full
    // semicircle. Left of vertical gives angles > π/2 naturally.
    const clampedDy = Math.max(uDy, 0);

    // Guard against cursor exactly on the vertex
    if (Math.abs(uDx) < 0.5 && clampedDy < 0.5) return null;

    return Math.atan2(clampedDy, uDx); // [0, π]
  }

  function onMove(evt) {
    const angle = getAngleFromEvent(evt);
    if (angle === null) return;
    state.indicatorAngle = angle;
    updateIndicator(state.indicatorAngle);
    updateReadout(state.indicatorAngle);
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    saveConfig();
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ── Window move drag ──────────────────────────────────────────────────────────

function startMoveDrag(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-move');
  btn.classList.add('dragging');

  const startMouse = { x: e.screenX, y: e.screenY };
  let startWinPos  = null;

  win.outerPosition().then(p => { startWinPos = p; });

  function onMove(evt) {
    if (!startWinPos) return;
    const dpr = window.devicePixelRatio || 1;
    win.setPosition(new PhysicalPosition(
      Math.round(startWinPos.x + (evt.screenX - startMouse.x) * dpr),
      Math.round(startWinPos.y + (evt.screenY - startMouse.y) * dpr),
    ));
  }

  function onUp() {
    btn.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    saveConfig();
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ── Resize drag ───────────────────────────────────────────────────────────────

function startResizeDrag(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-resize');
  btn.classList.add('dragging');

  const startMouseX = e.screenX;
  let   startSize   = null;

  win.outerSize().then(s => {
    const dpr = window.devicePixelRatio || 1;
    startSize = { w: s.width / dpr, h: s.height / dpr };
  });

  function onMove(evt) {
    if (!startSize) return;
    const newW = Math.max(280, startSize.w + (evt.screenX - startMouseX));
    // height = protractor area (390/560 of width) + fixed control bar (50px)
    win.setSize(new LogicalSize(newW, Math.round(newW * (390 / 560) + 50)));
  }

  function onUp() {
    btn.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    saveConfig();
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ── Rotate drag ───────────────────────────────────────────────────────────────

function startRotateDrag(e) {
  e.preventDefault();
  const btn    = document.getElementById('btn-rotate');
  btn.classList.add('dragging');

  const startX   = e.screenX;
  const startRot = state.rotation;

  function onMove(evt) {
    state.rotation = Math.max(-15, Math.min(15,
      startRot + (evt.screenX - startX) * 0.2
    ));
    setProtractorRotation(state.rotation);
  }

  function onUp() {
    btn.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    saveConfig();
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ── Arrow key nudge ───────────────────────────────────────────────────────────
//
// When pitch ≤ 24/12: nudge by ±0.1 pitch unit (natural for roofers).
// When pitch > 24/12 (near vertical): nudge by a fixed angle step instead,
// since Δpitch is huge per Δangle near 90°.

const NUDGE_PITCH     = 0.1;
const NUDGE_ANGLE_HI  = Math.atan(NUDGE_PITCH / 12); // ~0.0083 rad, consistent feel

let arrowSaveTimer = null;

document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;

  const angle    = state.indicatorAngle;
  const fromHoriz = angle <= Math.PI / 2 ? angle : Math.PI - angle;
  const pitch    = Math.tan(fromHoriz) * 12;
  const onRight  = angle < Math.PI / 2;   // true = right side of arc
  // "Right arrow" increases pitch on right side, decreases it on left side
  const increase = (e.key === 'ArrowRight') === onRight;

  let newAngle;
  if (pitch > 24) {
    // Near vertical: nudge by angle step
    const delta = increase ? NUDGE_ANGLE_HI : -NUDGE_ANGLE_HI;
    const newFromHoriz = Math.max(0, fromHoriz + (increase ? delta : -delta));
    newAngle = onRight ? newFromHoriz : Math.PI - newFromHoriz;
  } else {
    const newPitch = Math.max(0, pitch + (increase ? NUDGE_PITCH : -NUDGE_PITCH));
    const newFromHoriz = pitchToAngle(newPitch);
    newAngle = onRight ? newFromHoriz : Math.PI - newFromHoriz;
  }

  // Clamp to valid semicircle range (tiny epsilon keeps away from tan singularity)
  state.indicatorAngle = Math.max(0.0001, Math.min(Math.PI - 0.0001, newAngle));
  updateIndicator(state.indicatorAngle);
  updateReadout(state.indicatorAngle);

  clearTimeout(arrowSaveTimer);
  arrowSaveTimer = setTimeout(saveConfig, 500);
});

// ── Wire controls ─────────────────────────────────────────────────────────────

function wireControls() {
  document.getElementById('btn-move')
    .addEventListener('mousedown', startMoveDrag);

  document.getElementById('control-bar').addEventListener('mousedown', (e) => {
    if (e.target.closest('button, input, label')) return;
    e.preventDefault();
    win.startDragging().then(() => saveConfig());
  });
  document.getElementById('btn-resize')
    .addEventListener('mousedown', startResizeDrag);
  document.getElementById('btn-rotate')
    .addEventListener('mousedown', startRotateDrag);
  document.getElementById('indicator-handle')
    .addEventListener('mousedown', startIndicatorDrag);

  document.getElementById('btn-close').addEventListener('click', async () => {
    await saveConfig();
    await win.close();
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    state.settingsOpen ? closeSettings() : openSettings();
  });

  document.getElementById('btn-settings-close').addEventListener('click', closeSettings);

  document.getElementById('toggle-autostart').addEventListener('change', async (e) => {
    try {
      await invoke('set_autostart', { enable: e.target.checked });
    } catch (err) {
      console.error('set_autostart:', err);
      e.target.checked = !e.target.checked;
    }
  });

  document.getElementById('opacity-slider').addEventListener('input', (e) => {
    state.opacity = parseInt(e.target.value, 10);
    setArcOpacity(state.opacity / 100);
  });
  document.getElementById('opacity-slider')
    .addEventListener('change', saveConfig);
}

// ── Start ─────────────────────────────────────────────────────────────────────

init().catch(console.error);
