import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SparklesIcon, XIcon, PlayIcon, PauseIcon, ReloadIcon, MaximizeIcon, MinimizeIcon } from './Icons.jsx';

// AIri Integration - Opens web version (no local download required)
// Uses https://airi.moeru.ai - no additional setup needed for users
// All AI processing happens in the cloud, no local models to download
export default function AIriIntegration({ enabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef(null);
  const airiUrl = 'https://airi.moeru.ai';
  const webviewRef = useRef(null);

  const launchAIri = () => setIsRunning(true);
  const stopAIri = () => setIsRunning(false);
  
  const refreshWebview = () => {
    if (webviewRef.current?.reload) {
      webviewRef.current.reload();
    }
  };

  // Drag handlers
  const handleMouseDown = (e) => {
    // Only drag from header
    if (e.target.closest('.airi-panel-header')) {
      setIsDragging(true);
      const rect = panelRef.current?.getBoundingClientRect();
      dragOffset.current = {
        x: e.clientX - (rect?.left || 0),
        y: e.clientY - (rect?.top || 0)
      };
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

  if (!enabled) return null;

  return (
    <>
      <motion.button
        className="airi-fab"
        onClick={() => setIsOpen(true)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        title="Open Project AIri"
      >
        <SparklesIcon width={28} height={28} />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            ref={panelRef}
            className={`airi-panel ${compactMode ? 'compact-mode' : ''} ${isDragging ? 'dragging' : ''}`}
            style={{ 
              left: position.x, 
              top: position.y,
              cursor: isDragging ? 'grabbing' : 'default'
            }}
            onMouseDown={handleMouseDown}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
              <div className="airi-panel-header" style={{ cursor: 'grab' }}>
                <div className="airi-panel-title">
                  <SparklesIcon width={20} height={20} />
                  <span>Project AIri</span>
                </div>
                <div className="airi-panel-actions">
                  {!isRunning ? (
                    <button className="airi-action-btn primary" onClick={launchAIri}>
                      <PlayIcon width={16} height={16} /> Launch
                    </button>
                  ) : (
                    <>
                      <button className="airi-action-btn" onClick={refreshWebview} title="Refresh">
                        <ReloadIcon width={16} height={16} />
                      </button>
                      <button 
                        className={`airi-action-btn ${compactMode ? 'active' : ''}`}
                        onClick={() => setCompactMode(!compactMode)}
                        title={compactMode ? 'Expand' : 'Compact'}
                      >
                        {compactMode ? <MaximizeIcon width={16} height={16} /> : <MinimizeIcon width={16} height={16} />}
                      </button>
                      <button className="airi-action-btn danger" onClick={stopAIri}>
                        <PauseIcon width={16} height={16} /> Stop
                      </button>
                    </>
                  )}
                  <button className="airi-action-btn" onClick={() => setIsOpen(false)} title="Close">
                    <XIcon width={16} height={16} />
                  </button>
                </div>
              </div>

              <div className="airi-panel-content" style={{ height: 'calc(100% - 60px)' }}>
                {isRunning ? (
                  <webview ref={webviewRef} src={airiUrl} className="airi-webview" allowpopups />
                ) : (
                  <div className="airi-placeholder">
                    <SparklesIcon width={64} height={64} />
                    <h3>Project AIri</h3>
                    <p>Your AI companion with Live2D/3D avatars</p>
                    <button className="airi-action-btn primary" onClick={launchAIri}>
                      <PlayIcon width={20} height={20} /> Launch AIri
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
