// Preload script for YouTube Mini Player window
const { ipcRenderer } = require('electron');

// Inject title bar immediately when DOM is ready
function injectTitleBar() {
  if (document.getElementById('chinazes-miniplayer-titlebar')) return;

  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  const titleBar = document.createElement('div');
  titleBar.id = 'chinazes-miniplayer-titlebar';
  titleBar.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 4px !important;
    right: 4px !important;
    height: 32px !important;
    background: linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 100%) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 0 12px !important;
    z-index: 2147483647 !important;
    cursor: grab !important;
    opacity: 1 !important;
    user-select: none !important;
    -webkit-user-select: none !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    box-sizing: border-box !important;
    border-top-left-radius: 8px !important;
    border-top-right-radius: 8px !important;
    border-bottom: 1px solid rgba(255,255,255,0.1) !important;
    pointer-events: auto !important;
    -webkit-app-region: drag !important;
  `;

  const title = document.createElement('span');
  title.textContent = 'YouTube Mini Player';
  title.style.cssText = 'color: white; font-size: 13px; font-weight: 500; pointer-events: none; margin-right: auto;';

  const controls = document.createElement('div');
  controls.style.cssText = 'display: flex; gap: 6px; margin-left: auto; -webkit-app-region: no-drag !important;';

  // Minimize button
  const minBtn = document.createElement('button');
  minBtn.textContent = '−';
  minBtn.style.cssText = `
    background: rgba(255,255,255,0.1);
    border: none;
    color: white;
    font-size: 16px;
    cursor: pointer;
    width: 28px;
    height: 22px;
    border-radius: 4px;
    display: flex;
    -webkit-app-region: no-drag !important;;
    align-items: center;
    justify-content: center;
    line-height: 1;
  `;
  minBtn.onmouseenter = () => minBtn.style.background = 'rgba(255,255,255,0.2)';
  minBtn.onmouseleave = () => minBtn.style.background = 'rgba(255,255,255,0.1)';
  minBtn.onmousedown = (e) => e.stopPropagation();
  minBtn.onclick = (e) => {
    e.stopPropagation();
    ipcRenderer.send('youtube-miniplayer:minimize');
  };

  // Maximize button
  const maxBtn = document.createElement('button');
  maxBtn.textContent = '□';
  maxBtn.style.cssText = `
    background: rgba(255,255,255,0.1);
    border: none;
    color: white;
    font-size: 12px;
    cursor: pointer;
    width: 28px;
    height: 22px;
    border-radius: 4px;
    display: flex;
    -webkit-app-region: no-drag !important;
    align-items: center;
    justify-content: center;
    line-height: 1;
  `;
  maxBtn.onmouseenter = () => maxBtn.style.background = 'rgba(255,255,255,0.2)';
  maxBtn.onmouseleave = () => maxBtn.style.background = 'rgba(255,255,255,0.1)';
  maxBtn.onmousedown = (e) => e.stopPropagation();
  maxBtn.onclick = (e) => {
    e.stopPropagation();
    ipcRenderer.send('youtube-miniplayer:toggle-maximize');
  };

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.cssText = `
    background: rgba(255,255,255,0.1);
    border: none;
    color: white;
    font-size: 18px;
    cursor: pointer;
    width: 28px;
    height: 22px;
    border-radius: 4px;
    display: flex;
    -webkit-app-region: no-drag !important;
    align-items: center;
    justify-content: center;
    line-height: 1;
    font-weight: 300;
  `;
  closeBtn.onmouseenter = () => closeBtn.style.background = 'rgba(255,0,51,0.9)';
  closeBtn.onmouseleave = () => closeBtn.style.background = 'rgba(255,255,255,0.1)';
  closeBtn.onmousedown = (e) => e.stopPropagation();
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    ipcRenderer.send('youtube-miniplayer:request-close');
  };

  controls.appendChild(minBtn);
  controls.appendChild(maxBtn);
  controls.appendChild(closeBtn);
  titleBar.appendChild(title);
  titleBar.appendChild(controls);

  // Insert into body
  const insert = () => {
    if (document.body) {
      document.body.insertBefore(titleBar, document.body.firstChild);
      
      // Add CSS adjustments
      const style = document.createElement('style');
      style.textContent = `
        #chinazes-miniplayer-titlebar { pointer-events: auto !important; }
        .ytp-miniplayer-button { display: none !important; }
        html { padding-top: 32px !important; }
        ytd-app, #content.ytd-app { margin-top: 0 !important; padding-top: 0 !important; }
        #masthead-container.ytd-app { top: 32px !important; position: fixed !important; }
        #page-manager.ytd-app { margin-top: 32px !important; }
      `;
      document.head.appendChild(style);
      
      console.log('[Chinazes] Mini player title bar injected via preload');
    } else {
      setTimeout(insert, 50);
    }
  };
  insert();

  // Drag handling
  titleBar.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    isDragging = true;
    dragStartX = e.screenX;
    dragStartY = e.screenY;
    titleBar.style.cursor = 'grabbing';
    ipcRenderer.send('youtube-miniplayer:drag-start');
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaX = e.screenX - dragStartX;
    const deltaY = e.screenY - dragStartY;
    ipcRenderer.send('youtube-miniplayer:drag-move', { deltaX, deltaY });
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      titleBar.style.cursor = 'grab';
      ipcRenderer.send('youtube-miniplayer:drag-end');
    }
  });

  // Double-click to maximize
  titleBar.addEventListener('dblclick', (e) => {
    if (e.target.closest('button')) return;
    ipcRenderer.send('youtube-miniplayer:toggle-maximize');
  });

  // ── Resize handle (bottom-right corner) ──
  const resizeHandle = document.createElement('div');
  resizeHandle.id = 'chinazes-miniplayer-resize';
  resizeHandle.style.cssText = `
    position: fixed !important;
    bottom: 0 !important;
    right: 0 !important;
    width: 16px !important;
    height: 16px !important;
    cursor: nwse-resize !important;
    z-index: 2147483647 !important;
    pointer-events: auto !important;
    background: linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.15) 50%) !important;
    border-bottom-right-radius: 8px !important;
  `;

  let isResizing = false;
  let resizeStartW = 0;
  let resizeStartH = 0;
  let resizeStartX = 0;
  let resizeStartY = 0;

  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing = true;
    resizeStartW = window.innerWidth;
    resizeStartH = window.innerHeight;
    resizeStartX = e.screenX;
    resizeStartY = e.screenY;
    ipcRenderer.send('youtube-miniplayer:resize-start');
  });

  window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const dw = e.screenX - resizeStartX;
    const dh = e.screenY - resizeStartY;
    ipcRenderer.send('youtube-miniplayer:resize-move', { dw, dh });
  });

  window.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      ipcRenderer.send('youtube-miniplayer:resize-end');
    }
  });

  // Insert resize handle
  const insertResize = () => {
    if (document.body) {
      document.body.appendChild(resizeHandle);
    } else {
      setTimeout(insertResize, 50);
    }
  };
  insertResize();
}

// Try to inject immediately and on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectTitleBar);
} else {
  injectTitleBar();
}

// Also try after a short delay for SPAs
setTimeout(injectTitleBar, 100);
setTimeout(injectTitleBar, 500);
setTimeout(injectTitleBar, 1000);
