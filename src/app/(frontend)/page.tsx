'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// ─── Animated background grid ──────────────────────────────────────────────

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const SLOTS = [
  { top: '8%', height: '14%', color: '#F59E0B' },
  { top: '24%', height: '18%', color: '#3B82F6' },
  { top: '44%', height: '12%', color: '#8B5CF6' },
  { top: '58%', height: '20%', color: '#3B82F6' },
  { top: '80%', height: '10%', color: '#8B5CF6' },
]

function ShiftGridBg() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setTimeout(() => setMounted(true), 100)
  }, [])

  // Deterministic "random" fill per cell using a seeded pattern
  const seed = (d: number, s: number) => (d * 7 + s * 3) % 10

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 30%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, black 30%, transparent 100%)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `40px repeat(${DAYS.length}, 1fr)`,
          height: '100%',
          opacity: mounted ? 0.12 : 0,
          transition: 'opacity 1.2s ease',
          maxWidth: 900,
          margin: '0 auto',
          padding: '0 40px',
        }}
      >
        {/* Time gutter */}
        <div style={{ borderRight: '1px solid #475569' }}>
          {['06', '10', '14', '18', '22'].map((h) => (
            <div
              key={h}
              style={{
                height: '20%',
                display: 'flex',
                alignItems: 'flex-start',
                paddingTop: 4,
                paddingRight: 8,
                justifyContent: 'flex-end',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#94A3B8' }}>{h}:00</span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {DAYS.map((day, d) => (
          <div
            key={day}
            style={{
              position: 'relative',
              borderRight: d < DAYS.length - 1 ? '1px solid #1E293B' : 'none',
            }}
          >
            {/* Hour lines */}
            {[0, 1, 2, 3, 4].map((h) => (
              <div
                key={h}
                style={{
                  position: 'absolute',
                  top: `${h * 20}%`,
                  left: 0,
                  right: 0,
                  height: 1,
                  background: '#1E293B',
                }}
              />
            ))}
            {/* Shift blocks */}
            {SLOTS.filter((_, s) => seed(d, s) < 7).map((slot, s) => (
              <div
                key={s}
                style={{
                  position: 'absolute',
                  top: slot.top,
                  height: slot.height,
                  left: 4,
                  right: 4,
                  background: slot.color,
                  borderRadius: 4,
                  opacity: mounted ? 0.6 + seed(d, s) * 0.04 : 0,
                  transition: `opacity ${1.4 + s * 0.15}s ease ${d * 0.08 + s * 0.05}s`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Stat counter ──────────────────────────────────────────────────────────

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
      <span
        style={{
          fontFamily: '"DM Sans", system-ui, sans-serif',
          fontSize: 28,
          fontWeight: 800,
          color: 'white',
          letterSpacing: '-0.04em',
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: 11,
          color: '#64748B',
          fontWeight: 500,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
    </div>
  )
}

// ─── Feature card ──────────────────────────────────────────────────────────

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode
  title: string
  desc: string
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '20px 22px',
        borderRadius: 14,
        border: `1px solid ${hovered ? '#334155' : '#1E293B'}`,
        background: hovered ? '#0F172A' : 'rgba(15,23,42,0.5)',
        transition: 'all 0.2s ease',
        transform: hovered ? 'translateY(-2px)' : 'none',
        cursor: 'default',
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: '#1E293B',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
          border: '1px solid #334155',
        }}
      >
        {icon}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#F1F5F9',
          marginBottom: 5,
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6 }}>{desc}</div>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function HomePage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div
      style={{
        fontFamily: '"DM Sans", system-ui, sans-serif',
        background: '#020817',
        minHeight: '100vh',
        color: 'white',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ── Subtle radial glow ── */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(37,99,235,0.12) 0%, transparent 70%)',
        }}
      />

      {/* ── Nav ── */}
      <nav
        style={{
          position: 'relative',
          zIndex: 10,
          maxWidth: 1100,
          margin: '0 auto',
          padding: '20px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(59,130,246,0.4)',
            }}
          >
            <svg
              width="16"
              height="16"
              fill="none"
              stroke="white"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 15, color: 'white', letterSpacing: '-0.03em' }}>
            Shift<span style={{ color: '#3B82F6' }}>IQ</span>
          </span>
        </div>

        <Link href="/scheduler" style={{ textDecoration: 'none' }}>
          <div
            style={{
              height: 34,
              padding: '0 16px',
              borderRadius: 8,
              border: '1px solid #1E293B',
              background: 'rgba(30,41,59,0.8)',
              display: 'flex',
              alignItems: 'center',
              fontSize: 12,
              fontWeight: 600,
              color: '#94A3B8',
              cursor: 'pointer',
              gap: 6,
            }}
          >
            <svg
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
            </svg>
            Open Scheduler
          </div>
        </Link>
      </nav>

      {/* ── Hero ── */}
      <div style={{ position: 'relative', zIndex: 2 }}>
        {/* Animated bg grid */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <ShiftGridBg />
        </div>

        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '80px 32px 100px',
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          {/* Eyebrow */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '5px 14px',
              borderRadius: 99,
              border: '1px solid #1E293B',
              background: 'rgba(30,41,59,0.7)',
              marginBottom: 28,
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'none' : 'translateY(8px)',
              transition: 'all 0.6s ease',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#4ADE80',
                boxShadow: '0 0 6px #4ADE80',
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#64748B',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Workforce Management
            </span>
          </div>

          {/* Headline */}
          <h1
            style={{
              fontSize: 'clamp(44px, 7vw, 80px)',
              fontWeight: 900,
              letterSpacing: '-0.04em',
              lineHeight: 1.02,
              color: 'white',
              margin: '0 0 20px',
              maxWidth: 760,
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'none' : 'translateY(16px)',
              transition: 'all 0.7s ease 0.1s',
            }}
          >
            Smart scheduling,{' '}
            <span
              style={{
                background: 'linear-gradient(90deg, #3B82F6 0%, #60A5FA 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              zero&nbsp;gaps
            </span>
          </h1>

          {/* Sub */}
          <p
            style={{
              fontSize: 16,
              color: '#64748B',
              maxWidth: 520,
              lineHeight: 1.65,
              margin: '0 0 44px',
              fontWeight: 400,
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'none' : 'translateY(12px)',
              transition: 'all 0.7s ease 0.2s',
            }}
          >
            Automatically assign call centre staff across multiple workgroups based on skills,
            availability, and configurable hard and soft rules — with full manual override.
          </p>

          {/* CTA */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              justifyContent: 'center',
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'none' : 'translateY(8px)',
              transition: 'all 0.7s ease 0.3s',
            }}
          >
            <Link href="/scheduler" style={{ textDecoration: 'none' }}>
              <PrimaryButton />
            </Link>
          </div>

          {/* Stats row */}
          <div
            style={{
              display: 'flex',
              gap: 40,
              marginTop: 64,
              flexWrap: 'wrap',
              justifyContent: 'center',
              padding: '24px 40px',
              borderRadius: 16,
              border: '1px solid #1E293B',
              background: 'rgba(15,23,42,0.7)',
              backdropFilter: 'blur(8px)',
              opacity: mounted ? 1 : 0,
              transition: 'opacity 0.8s ease 0.5s',
            }}
          >
            <StatItem value="7" label="Days covered" />
            <div style={{ width: 1, background: '#1E293B', alignSelf: 'stretch' }} />
            <StatItem value="3" label="Rule types" />
            <div style={{ width: 1, background: '#1E293B', alignSelf: 'stretch' }} />
            <StatItem value="∞" label="Staff profiles" />
            <div style={{ width: 1, background: '#1E293B', alignSelf: 'stretch' }} />
            <StatItem value="<1s" label="Schedule generation" />
          </div>
        </div>
      </div>

      {/* ── Features ── */}
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '0 32px 80px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <FeatureCard
            icon={
              <svg
                width="16"
                height="16"
                fill="none"
                stroke="#3B82F6"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            }
            title="Multi-skill staff profiles"
            desc="Assign staff to multiple workgroups with a priority rank. The engine always prefers their primary skill."
          />
          <FeatureCard
            icon={
              <svg
                width="16"
                height="16"
                fill="none"
                stroke="#8B5CF6"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            }
            title="Hard & soft rules"
            desc="Hard rules block invalid assignments outright. Soft rules score penalties and surface warnings inline."
          />
          <FeatureCard
            icon={
              <svg
                width="16"
                height="16"
                fill="none"
                stroke="#F59E0B"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
            }
            title="Configurable rules"
            desc="Tune every parameter — rest hours, penalty weights, thresholds — without touching code."
          />
          <FeatureCard
            icon={
              <svg
                width="16"
                height="16"
                fill="none"
                stroke="#4ADE80"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
            }
            title="Manual reassignment"
            desc="Replace any assigned staff or fill a gap. Candidates are ranked by soft-rule score in real time."
          />
        </div>
      </div>

      {/* ── Footer ── */}
      <div
        style={{
          borderTop: '1px solid #0F172A',
          padding: '20px 32px',
          maxWidth: 1100,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          position: 'relative',
          zIndex: 2,
        }}
      >
        <span style={{ fontSize: 11, color: '#334155', fontWeight: 600, letterSpacing: '-0.01em' }}>
          Shift<span style={{ color: '#1E40AF' }}>IQ</span>
        </span>
        <span style={{ fontSize: 11, color: '#1E293B' }}>Workforce Management System</span>
      </div>
    </div>
  )
}

// ─── Primary CTA button (extracted for hover state) ────────────────────────

function PrimaryButton() {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        height: 52,
        padding: '0 28px',
        borderRadius: 12,
        background: hovered
          ? 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 100%)'
          : 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)',
        color: 'white',
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '-0.01em',
        cursor: 'pointer',
        boxShadow: hovered
          ? '0 0 0 1px rgba(59,130,246,0.5), 0 8px 32px rgba(37,99,235,0.5)'
          : '0 0 0 1px rgba(59,130,246,0.3), 0 4px 16px rgba(37,99,235,0.3)',
        transform: hovered ? 'translateY(-1px) scale(1.01)' : 'none',
        transition: 'all 0.18s ease',
        userSelect: 'none',
      }}
    >
      <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2.2" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
      </svg>
      Open Scheduler
      <svg
        width="14"
        height="14"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        viewBox="0 0 24 24"
        style={{ opacity: 0.7 }}
      >
        <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
