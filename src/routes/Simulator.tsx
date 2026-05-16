import { Navigate } from 'react-router-dom';
import { Info, MessageSquare } from 'lucide-react';
import { WhatsAppSimulator } from '../App';
import { useAuth } from '../context/AuthContext';
import { Badge, Card, CardBody } from '../ui';

export function SimulatorRoute() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/sign-in" replace />;

  return (
    <div
      data-themed
      className="min-h-full bg-[var(--color-canvas)] px-3 sm:px-8 lg:px-12 py-5 sm:py-6 lg:py-10"
    >
      <div className="max-w-[1100px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 lg:mb-8">
          <div className="min-w-0">
            <Badge tone="accent" dot className="mb-3">
              <MessageSquare className="size-3" />
              Sandbox
            </Badge>
            <h1 className="text-[26px] sm:text-[30px] font-semibold tracking-tight leading-[1.15] text-[var(--color-text-primary)]">
              WhatsApp Bot Simulator
            </h1>
            <p className="mt-1.5 text-[13.5px] text-[var(--color-text-secondary)] max-w-[60ch] leading-relaxed">
              Walk through the customer-facing booking flow exactly as a real WhatsApp user would.
              Bookings created here land in Firestore alongside live ones.
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 lg:gap-8 items-start">
          {/* Phone mockup */}
          <div className="flex justify-center lg:justify-end order-1">
            <WhatsAppSimulator userId={user.uid} />
          </div>

          {/* Info side panel — flows below phone on mobile, sticky sidebar on desktop */}
          <Card padded className="order-2 lg:sticky lg:top-20">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-7 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)] shrink-0">
                <Info className="size-3.5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-[14px] font-semibold tracking-tight text-[var(--color-text-primary)]">
                  How this differs from production
                </h3>
                <ul className="mt-2 space-y-2 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
                  <li>
                    Patient details here are parsed by a simple comma-split rather than Gemini.
                  </li>
                  <li>
                    Service-area gate uses the same PIN (679326) check as the live bot.
                  </li>
                  <li>
                    The conversation state machine mirrors{' '}
                    <code className="font-mono text-[12px] bg-[var(--color-sunken)] px-1 py-0.5 rounded">
                      botLogic.ts
                    </code>{' '}
                    step-for-step — useful for previewing copy changes before deploying.
                  </li>
                </ul>
              </div>
            </div>
            <hr className="my-5 border-[var(--color-border-subtle)]" />
            <CardBody className="!p-0">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { k: 'Bot version', v: 'v2' },
                  { k: 'Languages', v: 'EN · ML' },
                  { k: 'Channel', v: 'WhatsApp' },
                  { k: 'Mode', v: 'Simulated' },
                ].map((m) => (
                  <div
                    key={m.k}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-sunken)] px-3 py-2"
                  >
                    <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
                      {m.k}
                    </div>
                    <div className="text-[13px] font-medium text-[var(--color-text-primary)] tabular-nums">
                      {m.v}
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
