/* NEXUS — particle starfield + constellation backdrop.
   Fixed full-screen canvas behind the app. Reads --accent / --accent-2 from CSS vars so it
   re-tints when the style switches. Layers: parallax star dust, drifting nodes that link into
   faint constellations near the cursor, occasional comets. Respects reduced-motion. */
(function () {
  function rgbVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v ? v.split(/\s+/).map(Number) : fallback;
  }

  function start() {
    const canvas = document.getElementById('nexus-stars');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, DPR = Math.min(2, window.devicePixelRatio || 1);
    let accent = [232, 116, 42], accent2 = [255, 158, 74];

    function refreshColors() {
      accent = rgbVar('--accent', accent);
      accent2 = rgbVar('--accent-2', accent2);
    }

    // three parallax dust layers
    let dust = [];
    let nodes = [];     // brighter drifting nodes that form constellations
    let comets = [];
    const mouse = { x: -9999, y: -9999 };

    function build() {
      const area = W * H;
      const dustCount = Math.min(420, Math.round(area / 5200));
      dust = [];
      for (let i = 0; i < dustCount; i++) {
        const layer = i % 3; // 0 far .. 2 near
        dust.push({
          x: Math.random() * W, y: Math.random() * H,
          z: layer,
          r: (layer + 1) * 0.35 + Math.random() * 0.5,
          sp: (layer + 1) * 0.04 + Math.random() * 0.05,
          tw: Math.random() * Math.PI * 2,
          tws: 0.6 + Math.random() * 1.6,
        });
      }
      const nodeCount = Math.min(70, Math.round(area / 26000));
      nodes = [];
      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.12,
          r: 0.8 + Math.random() * 1.4,
          bright: Math.random() > 0.7,
        });
      }
    }

    function resize() {
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * DPR; canvas.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      build();
    }

    function spawnComet() {
      const edge = Math.random();
      const fromLeft = Math.random() > 0.5;
      comets.push({
        x: fromLeft ? -40 : W + 40,
        y: Math.random() * H * 0.6,
        vx: (fromLeft ? 1 : -1) * (3.5 + Math.random() * 2.5),
        vy: 1.4 + Math.random() * 1.2,
        life: 1,
        len: 80 + Math.random() * 90,
      });
    }

    let t = 0, cometTimer = 0;
    function frame() {
      t += 0.016;
      ctx.clearRect(0, 0, W, H);

      // dust
      for (const d of dust) {
        d.y += d.sp;
        if (d.y > H + 2) { d.y = -2; d.x = Math.random() * W; }
        d.tw += 0.016 * d.tws;
        const a = (d.z === 2 ? 0.55 : d.z === 1 ? 0.4 : 0.28) * (0.55 + 0.45 * Math.sin(d.tw));
        const col = d.z === 2 ? accent2 : (d.z === 1 ? accent : [200, 210, 225]);
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`;
        ctx.fill();
      }

      // nodes + constellation links
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
        // gentle attraction toward mouse
        const dxm = mouse.x - n.x, dym = mouse.y - n.y;
        const dm = Math.hypot(dxm, dym);
        if (dm < 160) { n.x += dxm * 0.0012 * (1 - dm / 160); n.y += dym * 0.0012 * (1 - dm / 160); }
      }
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 118) {
            const o = (1 - dist / 118) * 0.5;
            const mid = mouse.x > -999 ? Math.hypot((a.x + b.x) / 2 - mouse.x, (a.y + b.y) / 2 - mouse.y) : 9999;
            const near = mid < 180 ? 1.9 : 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${o * near})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        if (a.bright) {
          ctx.fillStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},0.95)`;
          ctx.shadowBlur = 8; ctx.shadowColor = `rgba(${accent[0]},${accent[1]},${accent[2]},0.9)`;
        } else {
          ctx.fillStyle = `rgba(${accent2[0]},${accent2[1]},${accent2[2]},0.7)`;
          ctx.shadowBlur = 0;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // comets
      cometTimer += 0.016;
      if (cometTimer > 4.2 && comets.length < 2) { if (Math.random() > 0.5) spawnComet(); cometTimer = 0; }
      comets = comets.filter(c => c.life > 0);
      for (const c of comets) {
        c.x += c.vx; c.y += c.vy; c.life -= 0.006;
        const tx = c.x - c.vx / Math.hypot(c.vx, c.vy) * c.len;
        const ty = c.y - c.vy / Math.hypot(c.vx, c.vy) * c.len;
        const grad = ctx.createLinearGradient(c.x, c.y, tx, ty);
        grad.addColorStop(0, `rgba(${accent2[0]},${accent2[1]},${accent2[2]},${0.9 * c.life})`);
        grad.addColorStop(1, `rgba(${accent2[0]},${accent2[1]},${accent2[2]},0)`);
        ctx.beginPath();
        ctx.moveTo(c.x, c.y); ctx.lineTo(tx, ty);
        ctx.strokeStyle = grad; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(c.x, c.y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.9 * c.life})`;
        ctx.shadowBlur = 10; ctx.shadowColor = `rgba(${accent2[0]},${accent2[1]},${accent2[2]},1)`;
        ctx.fill(); ctx.shadowBlur = 0;
      }

      if (!reduce) raf = requestAnimationFrame(frame);
    }

    let raf;
    window.addEventListener('resize', () => { DPR = Math.min(2, window.devicePixelRatio || 1); resize(); });
    window.addEventListener('mousemove', (e) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
    window.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });

    refreshColors();
    resize();
    if (reduce) { frame(); } else { raf = requestAnimationFrame(frame); }

    // expose so the app can re-tint on style switch
    window.NEXUS_STARS = { refreshColors };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
