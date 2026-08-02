'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import s from './launch.module.css';

// The opening frame (DEMO_SPEC §2 step 1): the provider app at Rural Care Clinic,
// on a patient's profile, with "Convene Experts" on the banner. Every row is LIVE
// hosted-Medplum data via /api/chart; coverage is a live Stedi test-mode call made
// when the chart opens, so benefits are on screen before anyone convenes.
//
// This screen shows three things and then gets out of the way: who the patient is,
// what is wrong with them, and what their insurance actually covers.

interface ChartRow {
  resourceType: string;
  display: string;
  fact: string;
  date: string;
}
interface PreviewSeat {
  specialty: string;
  status: string;
  name?: string;
  reason: string;
}
interface Benefits {
  payer: string;
  planActive?: boolean;
  copay?: string;
  deductibleRemaining?: string;
  oopRemaining?: string;
  network?: string;
  messages: string[];
  matched: boolean;
}
interface RosterEntry {
  id: string;
  family: string;
  given: string;
  reasonForVisit: string;
}
interface ChartData {
  caseId?: string;
  roster?: RosterEntry[];
  banner?: { name: string; dob: string; payer: string; medplumId?: string };
  source?: string;
  benefits?: Benefits | null;
  age?: number;
  sex?: string;
  chiefComplaint?: string;
  preview?: PreviewSeat[];
  resources?: ChartRow[];
  error?: string;
}

const NAV = ['Schedule', 'Tasks', 'Messages', 'Labs', 'Reports', 'Admin'];
const SHORT: Record<string, string> = {
  'internal-medicine': 'HOUSE',
  'diagnostic-skeptic': 'SKEPTIC',
  pulmonology: 'PULMO',
  gastroenterology: 'GASTRO',
  'infectious-disease': 'I.D.',
  cardiology: 'CARDIO',
  nephrology: 'NEPHRO',
  neurology: 'NEURO',
  endocrinology: 'ENDO',
  hematology: 'HEME',
  'clinical-pharmacology': 'PHARM',
  rheumatology: 'RHEUM',
  'patient-advocacy': 'ADVOCATE',
  reimbursement: 'ADVOCATE',
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

const daysSince = (iso: string) => Math.round((Date.now() - new Date(iso).getTime()) / 86400000);

/** "3 days ago" for anything recent, plain date otherwise — recency is the signal. */
function when(iso: string): string {
  if (!iso) return '—';
  const d = daysSince(iso);
  if (d < 0 || d > 90) return iso.slice(0, 10);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

export default function LaunchPage() {
  const router = useRouter();
  const [caseId, setCaseId] = useState<string | null>(null);
  const [chart, setChart] = useState<ChartData | null>(null);
  const [convening, setConvening] = useState(false);

  useEffect(() => {
    let alive = true;
    setChart(null);
    const q = caseId ? `?case=${encodeURIComponent(caseId)}` : '';
    fetch(`/api/chart${q}`)
      .then(async (r) => {
        const data = await r.json();
        if (alive) setChart(data);
      })
      .catch(() => alive && setChart({ error: 'Chart unavailable — Medplum did not respond.' }));
    return () => {
      alive = false;
    };
  }, [caseId]);

  const rows = useMemo(() => chart?.resources || [], [chart]);
  const byType = useCallback((type: string) => rows.filter((r) => r.resourceType === type), [rows]);

  const problems = useMemo(
    () => byType('Condition').sort((a, b) => (a.date < b.date ? 1 : -1)),
    [byType]
  );
  const meds = useMemo(
    () => byType('MedicationRequest').sort((a, b) => (a.date < b.date ? 1 : -1)),
    [byType]
  );
  const timeline = useMemo(
    () =>
      rows
        .filter((r) => r.date && r.resourceType !== 'Condition' && r.resourceType !== 'MedicationRequest')
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 12),
    [rows]
  );

  // The chair, the skeptic and the advocate sit on every consult, so listing them
  // beside the case-derived specialties buries the thing that actually varies.
  const STANDING = new Set(['diagnostic-skeptic', 'patient-advocacy', 'reimbursement']);
  const caseSeats = (chart?.preview || []).filter((p) => !STANDING.has(p.specialty));
  const standingSeats = (chart?.preview || []).filter((p) => STANDING.has(p.specialty));

  const convene = () => {
    setConvening(true);
    void fetch('/api/session/assemble', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId: chart?.caseId }),
    });
    // Let the overlay hold for a beat so the handoff reads as deliberate rather
    // than as a page flash; the room is opening on the server meanwhile.
    setTimeout(() => router.push('/'), 900);
  };

  const b = chart?.banner;
  const benefits = chart?.benefits;
  const roster = chart?.roster || [];
  const activeId = chart?.caseId || caseId;

  return (
    <div className={s.root}>
      <aside className={s.rail}>
        <div className={s.brand}>
          <span className={s.brandMark}>M</span> Medplum
        </div>
        <div className={s.clinic}>Rural Care Clinic</div>

        <div className={s.railLabel}>Today’s patients</div>
        {roster.map((p) => (
          <button
            key={p.id}
            className={s.patientBtn}
            aria-current={p.id === activeId}
            onClick={() => setCaseId(p.id)}
          >
            <div className={s.patientName}>
              {p.family}, {p.given}
            </div>
            <div className={s.patientWhy}>{p.reasonForVisit}</div>
          </button>
        ))}

        <div className={s.railLabel}>Workspace</div>
        {NAV.map((n) => (
          <div key={n} className={s.navItem}>
            {n}
          </div>
        ))}
      </aside>

      <main className={s.main}>
        <div className={s.crumb}>Patients / {b?.name || '…'}</div>

        <section className={s.banner}>
          <div className={s.avatar}>{initials(b?.name || '?')}</div>
          <div className={s.who}>
            <h1 className={s.name}>
              {b?.name || 'Loading…'}
              <span className={s.synthetic}>Synthetic</span>
            </h1>
            <div className={s.demographics}>
              {chart?.age ? `${chart.age}y` : '—'} · {chart?.sex || '—'} · DOB {b?.dob || '—'}
              {b?.medplumId ? ` · Medplum ${b.medplumId.slice(0, 8)}` : ''}
            </div>
            {chart?.chiefComplaint && <p className={s.reason}>{chart.chiefComplaint}</p>}
          </div>
          <button className={s.convene} onClick={convene} disabled={convening || !b}>
            Convene Experts
            <span className={s.conveneSub}>a panel reads this record and joins by voice</span>
          </button>
        </section>

        {chart?.error && <div className={s.error}>{chart.error}</div>}

        <div className={s.grid}>
          <section className={s.card}>
            <header className={s.cardHead}>
              Problem list <span className={s.count}>{problems.length}</span>
            </header>
            <div className={s.cardBody}>
              {problems.length === 0 && <div className={s.empty}>No conditions on file.</div>}
              {problems.slice(0, 6).map((p, i) => (
                <div key={i} className={s.row}>
                  <div className={s.rowMain}>
                    <div className={s.rowTitle}>{p.display}</div>
                  </div>
                  <div className={s.rowDate}>{p.date ? p.date.slice(0, 4) : '—'}</div>
                </div>
              ))}
            </div>
          </section>

          <section className={s.card}>
            <header className={s.cardHead}>
              Coverage <span className={s.count}>Stedi · live</span>
            </header>
            <div className={s.cardBody}>
              {!chart && <div className={s.pending}>checking eligibility…</div>}
              {chart && !benefits && (
                <div className={s.empty}>
                  No eligibility response. Coverage will be confirmed before scheduling.
                </div>
              )}
              {benefits && (
                <>
                  <div className={s.benefitRow}>
                    <span className={s.benefitLabel}>{benefits.payer || 'Payer'}</span>
                    <span className={s.status}>
                      <span className={s.dot} />
                      {benefits.planActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {benefits.deductibleRemaining && (
                    <div className={s.benefitRow}>
                      <span className={s.benefitLabel}>Deductible remaining</span>
                      <span className={s.benefitValue}>{benefits.deductibleRemaining}</span>
                    </div>
                  )}
                  {benefits.copay && (
                    <div className={s.benefitRow}>
                      <span className={s.benefitLabel}>Specialist copay</span>
                      <span className={s.benefitValue}>{benefits.copay}</span>
                    </div>
                  )}
                  {benefits.oopRemaining && (
                    <div className={s.benefitRow}>
                      <span className={s.benefitLabel}>Out-of-pocket remaining</span>
                      <span className={s.benefitValue}>{benefits.oopRemaining}</span>
                    </div>
                  )}
                  {benefits.messages.length > 0 && (
                    <div className={s.payerMsg}>{benefits.messages.join(' · ')}</div>
                  )}
                </>
              )}
            </div>
          </section>

          <section className={s.card}>
            <header className={s.cardHead}>
              Active medications <span className={s.count}>{meds.length}</span>
            </header>
            <div className={s.cardBody}>
              {meds.length === 0 && <div className={s.empty}>No medications on file.</div>}
              {meds.slice(0, 6).map((m, i) => {
                const recent = m.date && daysSince(m.date) <= 30;
                return (
                  <div key={i} className={`${s.row} ${recent ? s.recent : ''}`}>
                    <div className={s.rowMain}>
                      <div className={s.rowTitle}>{m.display}</div>
                    </div>
                    <div className={s.rowDate}>{m.date ? when(m.date) : '—'}</div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={s.card}>
            <header className={s.cardHead}>
              Panel this record would convene <span className={s.count}>preview</span>
            </header>
            <div className={s.cardBody}>
              <div className={s.preview}>
                {caseSeats.map((p) => (
                  <div
                    key={p.specialty}
                    className={`${s.previewChip} ${p.status === 'empty' ? s.gap : ''}`}
                  >
                    <span className={s.previewName}>
                      {SHORT[p.specialty] || p.specialty.toUpperCase()}
                      {p.status === 'empty' ? ' · none available' : ''}
                    </span>
                    <span className={s.previewWhy}>{p.reason}</span>
                  </div>
                ))}
              </div>
              <p className={s.previewFoot}>
                {standingSeats.length > 0 && (
                  <>
                    Plus {standingSeats.map((p) => SHORT[p.specialty] || p.specialty).join(', ')} and
                    the chair, who sit on every consult.{' '}
                  </>
                )}
                Seated from this record alone — what you say when you present the case counts for
                more, and can change who joins.
              </p>
            </div>
          </section>
        </div>

        <section className={`${s.card} ${s.timeline}`}>
          <header className={s.cardHead}>
            Recent activity <span className={s.count}>{timeline.length} of {rows.length}</span>
          </header>
          <div className={s.cardBody}>
            {timeline.map((r, i) => (
              <div key={i} className={s.tlRow}>
                <span className={s.tlDate}>{when(r.date)}</span>
                <span className={s.tlType}>{r.resourceType}</span>
                <span className={s.tlText}>{r.fact || r.display}</span>
              </div>
            ))}
          </div>
        </section>

        <p className={s.foot}>
          Synthetic patient · records live from hosted Medplum · eligibility from Stedi test mode
          <br />
          Decision support, not diagnosis — the panel argues, the clinician decides.
        </p>
      </main>

      {convening && (
        <div className={s.overlay} role="status">
          <div>
            <div className={s.overlayText}>Opening the consult room…</div>
            <div className={s.overlaySub}>reading {rows.length} records from the chart</div>
          </div>
        </div>
      )}
    </div>
  );
}
