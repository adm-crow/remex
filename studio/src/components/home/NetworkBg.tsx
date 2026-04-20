import { useEffect, useRef } from "react";

const PARTICLE_COUNT = 55;
const CONNECTION_DIST = 130;
const SPEED = 0.3;
const DOT_RADIUS = 1.8;
const COLOR_REFRESH_FRAMES = 90; // re-read CSS vars every ~1.5 s to pick up theme changes

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
}

function resolvePrimaryRGB(): [number, number, number] {
  // Read the raw CSS variable value (e.g. "oklch(0.42 0.10 265)")
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--primary").trim();
  // Canvas2D always resolves any CSS color syntax to sRGB pixel bytes
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [80, 80, 200];
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

export function NetworkBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const particles: Particle[] = [];
    let rafId: number;
    let frameCount = 0;
    let rgb = resolvePrimaryRGB();

    function resize() {
      canvas!.width  = canvas!.offsetWidth;
      canvas!.height = canvas!.offsetHeight;
    }

    function init() {
      resize();
      particles.length = 0;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
          x:  Math.random() * canvas!.width,
          y:  Math.random() * canvas!.height,
          vx: (Math.random() - 0.5) * SPEED,
          vy: (Math.random() - 0.5) * SPEED,
        });
      }
    }

    function draw() {
      frameCount++;
      if (frameCount % COLOR_REFRESH_FRAMES === 0) {
        rgb = resolvePrimaryRGB();
      }

      const [r, g, b] = rgb;
      const w = canvas!.width;
      const h = canvas!.height;
      ctx!.clearRect(0, 0, w, h);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        else if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        else if (p.y > h) p.y = 0;
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx   = particles[i].x - particles[j].x;
          const dy   = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECTION_DIST) {
            const alpha = (1 - dist / CONNECTION_DIST) * 0.28;
            ctx!.beginPath();
            ctx!.moveTo(particles[i].x, particles[i].y);
            ctx!.lineTo(particles[j].x, particles[j].y);
            ctx!.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
            ctx!.lineWidth   = 0.8;
            ctx!.stroke();
          }
        }
      }

      ctx!.fillStyle = `rgba(${r},${g},${b},0.55)`;
      for (const p of particles) {
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, DOT_RADIUS, 0, Math.PI * 2);
        ctx!.fill();
      }

      rafId = requestAnimationFrame(draw);
    }

    init();
    draw();

    const ro = new ResizeObserver(init);
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 w-full h-full opacity-70"
    />
  );
}
