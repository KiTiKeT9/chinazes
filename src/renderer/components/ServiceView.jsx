import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

export default function ServiceView({ service, visible, registerRef }) {
  const ref = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const wv = ref.current;
    if (!wv) return;
    registerRef?.(wv);
    const onStart = () => setLoading(true);
    const onStop = () => setLoading(false);
    wv.addEventListener('did-start-loading', onStart);
    wv.addEventListener('did-stop-loading', onStop);
    return () => {
      wv.removeEventListener('did-start-loading', onStart);
      wv.removeEventListener('did-stop-loading', onStop);
      registerRef?.(null);
    };
  }, [registerRef]);

  // Mute audio when this service is not visible (prevents TikTok/YouTube background autoplay).
  useEffect(() => {
    const wv = ref.current;
    if (!wv) return;
    try { wv.setAudioMuted?.(!visible); } catch {}
  }, [visible]);

  return (
    <motion.div
      className="service"
      style={{ display: visible ? 'block' : 'none' }}
      initial={false}
      animate={visible ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {loading && (
        <motion.div
          className="service__loader"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ background: service.gradient }}
        >
          <div className="service__spinner" />
        </motion.div>
      )}
      <webview
        ref={ref}
        src={service.url}
        partition={service.partition}
        allowpopups="true"
        webpreferences="autoplayPolicy=document-user-activation-required"
        style={{ width: '100%', height: '100%' }}
      />
    </motion.div>
  );
}
