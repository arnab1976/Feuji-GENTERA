/**
 * GENTERA — Home Page (single-viewport, no scroll)
 * Three equal-height professional cards: Phase 1 | GENTERA video | Phase 2
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useAppStore } from '@/store/appStore';

const PHASE1_STEPS = [
  'Intake Form — capture enterprise GenAI requirements',
  'AI Recommendation — propose multi-cloud architecture',
  'Cost & Review — estimate spend against budget ceiling',
  'Terraform HCL Generation — produce production IaC',
  'Execution Engine — deploy via ephemeral jump box',
  'Health Dashboard — monitor provisioned stack health',
  'Audit & Compliance — enforce policy & WORM audit trail',
  'Testing & QA — validate isolation and readiness',
  'Launch & Ops — canary rollout to production',
];

const PHASE2_STEPS = [
  'FinOps Overview — enterprise cost posture at a glance',
  'Cost Breakdown — map spend to provisioned resources',
  'AI Cost Recommendations — rightsizing & idle detection',
  'Approval Workflow — governed change with human gates',
  'Savings Dashboard — track realized vs. budgeted savings',
];

const PHASE3_STEPS = [
  'Neon.tech PostgreSQL — pgvector AI database setup',
  'Upstash Redis — serverless Celery broker & cache',
  'Render.com Backend — FastAPI containerized web service',
  'Vercel Frontend — Vite React SPA edge distribution',
  'Environment Matrix — DATABASE_URL & REDIS_URL binding',
];

const EXPERTISE = [
  { value: '<1hr', label: 'Environment Deploy' },
  { value: '40–50%', label: 'Faster Provisioning' },
  { value: '2–3 Weeks', label: 'First Production' },
  { value: '100%', label: 'Aligned to Your Org. Compliance Framework' },
];

const CARD_SHELL: CSSProperties = {
  flex: '1 1 0',
  alignSelf: 'stretch',
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 16,
  overflow: 'hidden',
  boxSizing: 'border-box',
  background:
    'linear-gradient(180deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)',
  boxShadow:
    '0 0 0 1px rgba(148, 163, 184, 0.12), 0 18px 40px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
};

const HEADER_BAND: CSSProperties = {
  flex: '0 0 72px',
  height: 72,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  padding: '0 16px',
  borderBottom: '1px solid rgba(51, 65, 85, 0.85)',
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.4) 0%, rgba(15, 23, 42, 0.15) 100%)',
  boxSizing: 'border-box',
};

function AccentBar({ color }: { color: string }) {
  return (
    <div
      style={{
        flex: '0 0 3px',
        height: 3,
        background: `linear-gradient(90deg, transparent 0%, ${color} 20%, ${color} 80%, transparent 100%)`,
        boxShadow: `0 0 12px ${color}`,
      }}
    />
  );
}

function StepRow({
  index,
  text,
  accent,
}: {
  index: number;
  text: string;
  accent: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 0,
        padding: '6px 10px',
        borderRadius: 10,
        background: 'rgba(15, 23, 42, 0.55)',
        border: '1px solid rgba(51, 65, 85, 0.55)',
      }}
    >
      <div
        style={{
          flex: '0 0 24px',
          width: 24,
          height: 24,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 800,
          color: accent,
          background: `${accent}22`,
          border: `1px solid ${accent}55`,
        }}
      >
        {index}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 11.5,
          lineHeight: 1.35,
          color: '#E2E8F0',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {text}
      </div>
    </div>
  );
}

function PhaseCard({
  phaseLabel,
  title,
  subtitle,
  accent,
  steps,
}: {
  phaseLabel: string;
  title: string;
  subtitle: string;
  accent: string;
  steps: string[];
}) {
  return (
    <div style={CARD_SHELL}>
      <AccentBar color={accent} />
      <div style={HEADER_BAND}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.14em',
            color: accent,
            marginBottom: 4,
          }}
        >
          {phaseLabel}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#F8FAFC', lineHeight: 1.1 }}>
          {title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: '#94A3B8',
            marginTop: 4,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {subtitle}
        </div>
      </div>

      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-evenly',
          gap: 6,
          padding: '12px 12px 14px',
          boxSizing: 'border-box',
        }}
      >
        {steps.map((step, i) => (
          <StepRow key={step} index={i + 1} text={step} accent={accent} />
        ))}
      </div>
    </div>
  );
}

function ArchitectureCard({ children }: { children: ReactNode }) {
  return (
    <div style={CARD_SHELL}>
      <AccentBar color="#38BDF8" />
      <div
        style={{
          ...HEADER_BAND,
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.12em',
            color: '#38BDF8',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '100%',
          }}
        >
          GENTERA — ENTERPRISE AI CONTROL PLANE
        </div>
        <div
          style={{
            fontSize: 11,
            color: '#94A3B8',
            marginTop: 6,
            whiteSpace: 'nowrap',
          }}
        >
          Play · Volume · Maximize / Full view
        </div>
      </div>
      <div style={{ flex: '1 1 auto', minHeight: 0, position: 'relative' }}>{children}</div>
    </div>
  );
}

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function MinterraCenterVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = volume;
    el.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    const onFsChange = () => {
      const fs = Boolean(document.fullscreenElement);
      setIsFullscreen(fs);
      if (!fs) setExpanded(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  const syncTime = () => {
    const el = videoRef.current;
    if (!el) return;
    setCurrent(el.currentTime);
    setDuration(el.duration || 0);
    setProgress(el.duration ? el.currentTime / el.duration : 0);
  };

  const startPlayback = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = false;
    setMuted(false);
    void el.play().then(() => {
      setStarted(true);
      setPlaying(true);
      setShowControls(true);
    });
  };

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (!started) {
      startPlayback();
      return;
    }
    if (el.paused) {
      void el.play().then(() => setPlaying(true));
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const seekTo = (ratio: number) => {
    const el = videoRef.current;
    if (!el || !el.duration) return;
    el.currentTime = Math.min(1, Math.max(0, ratio)) * el.duration;
    syncTime();
  };

  const bumpVolume = (delta: number) => {
    setMuted(false);
    setVolume((v) => Math.min(1, Math.max(0, Math.round((v + delta) * 100) / 100)));
  };

  const toggleMute = () => setMuted((m) => !m);

  const toggleExpand = () => {
    if (isFullscreen) {
      void document.exitFullscreen();
      setExpanded(false);
      return;
    }
    setExpanded((e) => !e);
  };

  const toggleFullscreen = async () => {
    const node = shellRef.current;
    if (!node) return;
    try {
      if (!document.fullscreenElement) {
        setExpanded(true);
        await node.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
        setExpanded(false);
      }
    } catch {
      // Fallback: in-page maximize
      setExpanded((e) => !e);
    }
  };

  const progressFill = `linear-gradient(90deg, #14B8A6 0%, #38BDF8 ${Math.max(progress * 100, 2)}%, rgba(51,65,85,0.95) ${Math.max(progress * 100, 2)}%)`;
  const volumeFill = `linear-gradient(90deg, #14B8A6 0%, #38BDF8 ${volume * 100}%, rgba(51,65,85,0.95) ${volume * 100}%)`;

  return (
    <div
      ref={shellRef}
      className={expanded ? 'minterra-player-expanded' : undefined}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#090D16',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseEnter={() => setShowControls(true)}
      onMouseMove={() => setShowControls(true)}
      onMouseLeave={() => {
        if (playing) setShowControls(false);
      }}
    >
      <div style={{ flex: '1 1 auto', minHeight: 0, position: 'relative' }}>
        <video
          ref={videoRef}
          src="/minterra_control_plane.mp4?v=yt-CHrqFtSmFxw"
          poster="/minterra_control_plane_thumb.jpg?v=2"
          playsInline
          preload="metadata"
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            objectFit: 'contain',
            objectPosition: 'center center',
            background: '#090D16',
          }}
          onTimeUpdate={syncTime}
          onLoadedMetadata={syncTime}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setStarted(false);
            setProgress(0);
            setCurrent(0);
            setShowControls(true);
          }}
          onClick={togglePlay}
        />

        {!started && (
          <button
            type="button"
            onClick={startPlayback}
            aria-label="Play GENTERA Enterprise AI Control Plane video"
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 5,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              padding: 0,
            }}
          >
            <span style={{ position: 'relative', width: 68, height: 68 }}>
              <span className="journey-pulse-ring" />
              <span className="journey-pulse-ring" style={{ animationDelay: '0.6s' }} />
              <span
                className="journey-play-btn"
                style={{
                  position: 'relative',
                  width: 68,
                  height: 68,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0D9488 0%, #0284C7 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid rgba(248,250,252,0.4)',
                }}
              >
                <i className="ti ti-player-play-filled" style={{ fontSize: 28, color: '#fff', marginLeft: 3 }} />
              </span>
            </span>
            <span
              style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: '#F8FAFC',
                textShadow: '0 2px 10px rgba(0,0,0,0.75)',
                background: 'rgba(9,13,22,0.6)',
                padding: '6px 12px',
                borderRadius: 999,
                border: '1px solid rgba(56,189,248,0.35)',
              }}
            >
              PLAY VIDEO
            </span>
          </button>
        )}
      </div>

      {/* Custom control bar — teal/sky home accents */}
      {started && (
        <div
          style={{
            flex: '0 0 auto',
            zIndex: 6,
            padding: expanded ? '12px 16px 16px' : '8px 10px 10px',
            background:
              'linear-gradient(180deg, rgba(9,13,22,0) 0%, rgba(9,13,22,0.92) 35%, rgba(15,23,42,0.98) 100%)',
            opacity: showControls || !playing ? 1 : 0,
            transition: 'opacity 0.25s ease',
            pointerEvents: showControls || !playing ? 'auto' : 'none',
          }}
        >
          <input
            className="minterra-progress"
            type="range"
            min={0}
            max={1000}
            value={Math.round(progress * 1000)}
            aria-label="Video progress"
            onChange={(e) => seekTo(Number(e.target.value) / 1000)}
            style={{ background: progressFill, marginBottom: 8 }}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            <button type="button" className="minterra-player-btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
              <i className={`ti ${playing ? 'ti-player-pause-filled' : 'ti-player-play-filled'}`} style={{ fontSize: 15 }} />
            </button>

            <span
              style={{
                fontFamily: "'IBM Plex Sans', sans-serif",
                fontSize: 11,
                color: '#94A3B8',
                minWidth: 78,
                letterSpacing: '0.02em',
              }}
            >
              {formatTime(current)} / {formatTime(duration)}
            </span>

            <div style={{ width: 1, height: 18, background: 'rgba(51,65,85,0.9)', margin: '0 2px' }} />

            <button
              type="button"
              className="minterra-player-btn"
              onClick={() => bumpVolume(-0.1)}
              aria-label="Decrease volume"
              title="Volume down"
            >
              <i className="ti ti-volume-down" style={{ fontSize: 16 }} />
            </button>
            <button
              type="button"
              className="minterra-player-btn"
              onClick={toggleMute}
              aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}
              title="Mute"
            >
              <i
                className={`ti ${muted || volume === 0 ? 'ti-volume-off' : 'ti-volume'}`}
                style={{ fontSize: 15 }}
              />
            </button>
            <input
              className="minterra-range"
              type="range"
              min={0}
              max={100}
              value={muted ? 0 : Math.round(volume * 100)}
              aria-label="Volume"
              onChange={(e) => {
                const next = Number(e.target.value) / 100;
                setVolume(next);
                setMuted(next === 0);
              }}
              style={{ width: expanded ? 110 : 72, background: muted ? 'rgba(51,65,85,0.95)' : volumeFill }}
            />
            <button
              type="button"
              className="minterra-player-btn"
              onClick={() => bumpVolume(0.1)}
              aria-label="Increase volume"
              title="Volume up"
            >
              <i className="ti ti-volume-up" style={{ fontSize: 16 }} />
            </button>

            <div style={{ flex: 1, minWidth: 8 }} />

            <button
              type="button"
              className="minterra-player-btn"
              onClick={toggleExpand}
              aria-label={expanded ? 'Minimize video' : 'Maximize video'}
              title={expanded ? 'Minimize' : 'Maximize'}
            >
              <i className={`ti ${expanded && !isFullscreen ? 'ti-arrows-minimize' : 'ti-arrows-maximize'}`} style={{ fontSize: 15 }} />
            </button>
            <button
              type="button"
              className="minterra-player-btn"
              onClick={() => void toggleFullscreen()}
              aria-label={isFullscreen ? 'Exit full view' : 'Full view'}
              title={isFullscreen ? 'Exit full view' : 'Full view'}
            >
              <i className={`ti ${isFullscreen ? 'ti-minimize' : 'ti-maximize'}`} style={{ fontSize: 15 }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const { setPage } = useAppStore();

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        background: '#090D16',
        color: '#F8FAFC',
        fontFamily: 'var(--fn)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
      {/* Hero */}
      <div
        style={{
          flex: '0 0 auto',
          textAlign: 'center',
          padding: '12px 20px 10px',
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(6, 78, 59, 0.55) 0%, #0F172A 70%)',
          borderBottom: '1px solid #1E293B',
        }}
      >
        <h1
          className="home-hero-title"
          style={{
            margin: 0,
            fontSize: 'clamp(18px, 2.2vw, 28px)',
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: '-0.02em',
            color: '#38BDF8',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            width: '100%',
          }}
        >
          One Click. Any Cloud. Enterprise AI Instantly
        </h1>

        <p
          className="home-hero-desc"
          style={{
            margin: '8px auto 0',
            padding: '0 8px',
            fontSize: 'clamp(10px, 1vw, 12.5px)',
            lineHeight: 1,
            color: '#94A3B8',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            width: '100%',
          }}
        >
          Standardize, provision, govern, and scale production-ready LLM and RAG ecosystems across hybrid and multi-cloud environments.
        </p>

        <button
          type="button"
          onClick={() => setPage('provider')}
          style={{
            marginTop: 10,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: '#FFFFFF',
            background: 'linear-gradient(135deg, #0D9488 0%, #0284C7 100%)',
            padding: '9px 18px',
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 0 22px rgba(13, 148, 136, 0.4)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            textTransform: 'uppercase',
          }}
        >
          <i className="ti ti-rocket" style={{ fontSize: 14 }} />
          Start GENTERA Journey
        </button>

        {/* Four application expertise highlights */}
        <div
          style={{
            marginTop: 12,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 10,
            width: '100%',
            maxWidth: 980,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          {EXPERTISE.map((item, i) => (
            <div
              key={item.label}
              style={{
                textAlign: 'center',
                padding: '8px 8px 9px',
                borderRadius: 10,
                background: 'rgba(15, 23, 42, 0.55)',
                border: '1px solid rgba(51, 65, 85, 0.75)',
                boxShadow: i % 2 === 0
                  ? 'inset 0 1px 0 rgba(20, 184, 166, 0.25)'
                  : 'inset 0 1px 0 rgba(56, 189, 248, 0.25)',
              }}
            >
              <div
                style={{
                  fontFamily: "'Sora', sans-serif",
                  fontSize: 'clamp(13px, 1.35vw, 16px)',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.1,
                  color: i % 2 === 0 ? '#14B8A6' : '#38BDF8',
                }}
              >
                {item.value}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 'clamp(9px, 0.85vw, 11px)',
                  fontWeight: 600,
                  lineHeight: 1.25,
                  color: '#94A3B8',
                }}
              >
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Three equal cards — common top & bottom */}
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          alignItems: 'stretch',
          gap: 14,
          padding: '12px 14px 14px',
          boxSizing: 'border-box',
        }}
      >
        <PhaseCard
          phaseLabel="PHASE 1"
          title="GENTERA Kit"
          subtitle="Enterprise architecture provisioning — step by step"
          accent="#14B8A6"
          steps={PHASE1_STEPS}
        />

        <ArchitectureCard>
          <MinterraCenterVideo />
        </ArchitectureCard>

        <PhaseCard
          phaseLabel="PHASE 2"
          title="GENTERA FinOps"
          subtitle="Continuous cost governance — step by step"
          accent="#38BDF8"
          steps={PHASE2_STEPS}
        />
      </div>
    </div>
  );
}
