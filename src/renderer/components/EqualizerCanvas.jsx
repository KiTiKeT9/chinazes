import React, { useEffect, useRef } from 'react';

const NUM_PARTICLES = 16;

export default function EqualizerCanvas({ playing, vertical }) {
  const canvasRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;

    function resize() {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      sizeRef.current = { w: rect.width, h: rect.height };
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    }
    resize();
    window.addEventListener('resize', resize);

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let raf;
    let intensity = 0;
    let micVolume = 0;
    let micStream = null;
    let audioCtx = null;
    let analyser = null;
    let dataArray = null;

    // ── Particle system ──────────────────────────────
    let particles = [];
    function spawn(cw, ch, y) {
      const layer = Math.floor(Math.random() * 4);
      const baseSize = [100, 75, 55, 40][layer];
      return {
        layer,
        x: vertical
          ? cw * (0.02 + Math.random() * 0.3)
          : cw * (0.85 + Math.random() * 0.2),
        y: y != null ? y : vertical
          ? ch * (0.9 + Math.random() * 0.15)
          : ch * (0.05 + Math.random() * 0.9),
        baseR: baseSize + Math.random() * 40,
        speed: (0.15 + Math.random() * 0.25) * [0.5, 0.7, 1.0, 1.4][layer],
        driftAmp: (0.3 + Math.random() * 0.5) * [0.4, 0.6, 0.8, 1.0][layer],
        driftPhase: Math.random() * Math.PI * 2,
        wobblePhase: Math.random() * Math.PI * 2,
        baseAlpha: 0.18 + Math.random() * 0.14,
        lifePhase: Math.random() * Math.PI * 2,
      };
    }

    function initParticles(cw, ch) {
      particles = [];
      for (let i = 0; i < NUM_PARTICLES; i++) {
        particles.push(spawn(cw, ch));
      }
    }

    // ── Microphone ───────────────────────────────────
    async function startMic() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const actx = new (window.AudioContext || window.webkitAudioContext)();
        const src = actx.createMediaStreamSource(stream);
        const anl = actx.createAnalyser();
        anl.fftSize = 128;
        src.connect(anl);
        const arr = new Uint8Array(anl.frequencyBinCount);
        micStream = stream;
        audioCtx = actx;
        analyser = anl;
        dataArray = arr;
      } catch (_) {
        micStream = null; audioCtx = null; analyser = null;
      }
    }

    function stopMic() {
      if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
      if (audioCtx) { audioCtx.close(); audioCtx = null; }
      analyser = null; dataArray = null;
    }

    function getVolume() {
      if (!analyser || !dataArray) return 0;
      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] / 128 - 1;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / dataArray.length) * 3);
    }

    // ── Animation ────────────────────────────────────
    initParticles(0, 0);
    let firstFrame = true;

    function animate(time) {
      raf = requestAnimationFrame(animate);
      const { w, h } = sizeRef.current;
      const cw = w * dpr;
      const ch = h * dpr;
      if (cw < 1 || ch < 1) return;

      if (firstFrame) { initParticles(cw, ch); firstFrame = false; }

      const isPlaying = playingRef.current;

      if (isPlaying && !micStream) startMic();
      if (!isPlaying && micStream) stopMic();

      if (isPlaying) micVolume = getVolume();
      else micVolume *= 0.93;

      const target = isPlaying ? Math.min(1, micVolume * 2.5 + 0.08) : 0;
      intensity += (target - intensity) * 0.05;

      ctx.clearRect(0, 0, cw, ch);
      if (intensity < 0.005) return;

      const s = Math.min(1, intensity * 1.4);
      const t = time * 0.001;

      for (const p of particles) {
        if (vertical) {
          // ── Vertical (sidebar): rise upward ──────────
          const riseSpeed = p.speed * dpr * (0.6 + s * 1.2);
          p.y -= riseSpeed;

          const drift = Math.sin(t * 0.4 * (0.5 + s * 0.8) + p.driftPhase)
            * p.driftAmp * dpr * (0.5 + s * 1.5);
          p.x += drift * 0.3;

          const wobble = Math.sin(t * 0.7 + p.wobblePhase) * dpr * (0.3 + s * 0.6);

          if (p.y < -p.baseR * dpr * 2) {
            const n = spawn(cw, ch, ch + Math.random() * 20);
            p.x = n.x; p.y = n.y; p.baseR = n.baseR; p.baseAlpha = n.baseAlpha;
            p.speed = n.speed; p.driftAmp = n.driftAmp;
            p.driftPhase = Math.random() * Math.PI * 2;
            p.wobblePhase = Math.random() * Math.PI * 2;
            p.lifePhase = Math.random() * Math.PI * 2;
            continue;
          }

          const normY = p.y / ch;
          const fadeIn = Math.min(1, Math.max(0, (normY - 0.75) / 0.15));
          const fadeOut = Math.min(1, Math.max(0, (0.3 - normY) / 0.15));
          const verticalFade = normY < 0.5 ? 1 - fadeOut : 1 - fadeIn;
          const pulse = 1 + 0.12 * Math.sin(t * 0.5 + p.lifePhase);
          const soundBlow = 1 + s * 1.8;
          const radius = p.baseR * dpr * pulse * soundBlow;
          const breathe = 0.8 + 0.2 * Math.sin(t * 0.3 + p.lifePhase * 1.5);
          const soundBoost = s * 0.3;
          const alpha = p.baseAlpha * breathe * verticalFade * (1.0 + soundBoost) * (0.6 + micVolume * 0.4);
          if (alpha < 0.005) continue;

          const cx = p.x + wobble;
          const cy = p.y;
          const soft = [0.6, 0.4, 0.2, 0.0][p.layer];
          drawBlob(ctx, cx, cy, radius, alpha, soft, s);

        } else {
          // ── Horizontal (titlebar): flow right → left ─
          const flowSpeed = p.speed * dpr * (0.6 + s * 1.2);
          p.x -= flowSpeed;

          const drift = Math.sin(t * 0.5 * (0.5 + s * 0.8) + p.driftPhase)
            * p.driftAmp * dpr * (0.5 + s * 1.5);
          p.y += drift * 0.3;

          const wobble = Math.sin(t * 0.7 + p.wobblePhase) * dpr * (0.3 + s * 0.6);

          if (p.x < -p.baseR * dpr * 2) {
            const n = spawn(cw, ch);
            p.x = cw + n.x;
            p.y = n.y; p.baseR = n.baseR; p.baseAlpha = n.baseAlpha;
            p.speed = n.speed; p.driftAmp = n.driftAmp;
            p.driftPhase = Math.random() * Math.PI * 2;
            p.wobblePhase = Math.random() * Math.PI * 2;
            p.lifePhase = Math.random() * Math.PI * 2;
            continue;
          }

          const normX = p.x / cw;
          const fadeIn = Math.min(1, Math.max(0, (0.15 - normX) / 0.1));
          const fadeOut = Math.min(1, Math.max(0, (normX - 0.85) / 0.1));
          const horizFade = normX < 0.5 ? 1 - fadeOut : 1 - fadeIn;

          const pulse = 1 + 0.12 * Math.sin(t * 0.5 + p.lifePhase);
          const soundBlow = 1 + s * 1.8;
          const radius = p.baseR * dpr * pulse * soundBlow;
          const breathe = 0.8 + 0.2 * Math.sin(t * 0.3 + p.lifePhase * 1.5);
          const soundBoost = s * 0.3;
          const alpha = p.baseAlpha * breathe * horizFade * (1.0 + soundBoost) * (0.6 + micVolume * 0.4);
          if (alpha < 0.005) continue;

          const cx = p.x + wobble;
          const cy = p.y;
          const soft = [0.6, 0.4, 0.2, 0.0][p.layer];
          drawBlob(ctx, cx, cy, radius, alpha, soft, s);
        }
      }
    }

    function drawBlob(ctx, cx, cy, radius, alpha, soft, s) {
      const innerR = radius * (0.1 + soft * 0.15);
      const midR   = radius * (0.4 + soft * 0.2);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, `rgba(255,0,51,${Math.min(1, alpha * (2.0 + s * 0.6))})`);
      grad.addColorStop(innerR / radius, `rgba(255,0,51,${alpha * (1.2 - soft * 0.3)})`);
      grad.addColorStop(midR / radius,   `rgba(255,0,51,${alpha * 0.3})`);
      grad.addColorStop(0.8, `rgba(255,0,51,${alpha * 0.08})`);
      grad.addColorStop(1, 'rgba(255,0,51,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }

    raf = requestAnimationFrame(animate);
    return () => {
      window.removeEventListener('resize', resize);
      if (raf) cancelAnimationFrame(raf);
      stopMic();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [vertical]);

  return (
    <div className={
      `app__equalizer`
      + (vertical ? ' app__equalizer--v' : ' app__equalizer--h')
    }>
      <canvas ref={canvasRef} />
    </div>
  );
}
