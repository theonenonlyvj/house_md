'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

// Demo opening frame (DEMO_SPEC §2 step 1): the Medplum-style provider app at
// "Rural Care Clinic", on Tuan Pham's profile. Dr. Lee clicks "Convene Panel" →
// the council screen. Chart rows are LIVE hosted-Medplum data via /api/chart.
// Styles are scoped inline so this page never collides with the council UI lane.

interface ChartRow {
  resourceType: string;
  display: string;
  date: string;
}
interface ChartData {
  banner?: { name: string; dob: string; payer: string; medplumId?: string };
  source?: string;
  resources?: ChartRow[];
  error?: string;
}

const S: Record<string, React.CSSProperties> = {
  root: { display: 'flex', minHeight: '100vh', background: '#f8f7fc', color: '#1a1523', fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif" },
  side: { width: 220, background: '#170f2b', color: '#cfc6ea', padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 4 },
  logo: { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 18, color: '#fff', marginBottom: 6 },
  logoMark: { width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#946cf0,#6247aa)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 900 },
  clinic: { fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9d8fc7', margin: '2px 0 18px 34px' },
  nav: { padding: '9px 10px', borderRadius: 8, fontSize: 13.5, cursor: 'default' },
  navActive: { background: '#2c2050', color: '#fff', fontWeight: 600 },
  main: { flex: 1, padding: '22px 30px', maxWidth: 1100 },
  crumb: { fontSize: 12.5, color: '#6f6690', marginBottom: 14 },
  bannerCard: { background: '#fff', border: '1px solid #e6e1f2', borderRadius: 12, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 18, boxShadow: '0 1px 4px rgba(40,20,80,0.05)' },
  avatar: { width: 54, height: 54, borderRadius: '50%', background: '#eee8fb', color: '#6247aa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20 },
  pname: { fontSize: 21, fontWeight: 800 },
  pmeta: { fontSize: 13, color: '#6f6690', marginTop: 3 },
  syn: { fontSize: 11, background: '#fdf3d7', color: '#8a6d1a', borderRadius: 999, padding: '2px 9px', marginLeft: 10, verticalAlign: 'middle' },
  convene: { marginLeft: 'auto', background: 'linear-gradient(135deg,#946cf0,#6247aa)', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 22px', fontSize: 15.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 3px 10px rgba(98,71,170,0.35)' },
  tabs: { display: 'flex', gap: 18, margin: '20px 2px 10px', borderBottom: '1px solid #e6e1f2', fontSize: 13.5 },
  tab: { padding: '8px 2px', color: '#6f6690' },
  tabActive: { color: '#6247aa', fontWeight: 700, borderBottom: '2px solid #6247aa' },
  section: { background: '#fff', border: '1px solid #e6e1f2', borderRadius: 12, marginTop: 14, overflow: 'hidden' },
  secHead: { padding: '10px 16px', fontSize: 12, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#6f6690', borderBottom: '1px solid #efeaf8', background: '#fbfaff' },
  row: { display: 'flex', gap: 14, padding: '9px 16px', fontSize: 13.5, borderBottom: '1px solid #f4f1fb' },
  rowDate: { width: 92, color: '#6f6690', flexShrink: 0, fontVariantNumeric: 'tabular-nums' },
  rowType: { width: 140, color: '#6247aa', flexShrink: 0, fontWeight: 600 },
  foot: { textAlign: 'center', color: '#9d8fc7', fontSize: 12, padding: 16 },
};

const NAV = ['Patients', 'Schedule', 'Tasks', 'Messages', 'Labs', 'Reports', 'Admin'];

export default function LaunchPage() {
  const router = useRouter();
  const [chart, setChart] = useState<ChartData | null>(null);
  const [convening, setConvening] = useState(false);

  useEffect(() => {
    fetch('/api/chart').then(async (r) => setChart(await r.json())).catch(() => setChart({ error: 'chart unavailable' }));
  }, []);

  const groups = useMemo(() => {
    const rows = chart?.resources || [];
    const order = ['Condition', 'MedicationRequest', 'Observation', 'DiagnosticReport', 'Encounter', 'ServiceRequest', 'Immunization'];
    return order
      .map((t) => ({
        type: t,
        rows: rows.filter((r) => r.resourceType === t).sort((a, b) => (a.date < b.date ? 1 : -1)),
      }))
      .filter((g) => g.rows.length > 0);
  }, [chart]);

  const convene = () => {
    setConvening(true);
    router.push('/?convene=1');
  };

  const b = chart?.banner;
  return (
    <div style={S.root}>
      <aside style={S.side}>
        <div style={S.logo}><span style={S.logoMark}>M</span> Medplum</div>
        <div style={S.clinic}>Rural Care Clinic</div>
        {NAV.map((n, i) => (
          <div key={n} style={{ ...S.nav, ...(i === 0 ? S.navActive : {}) }}>{n}</div>
        ))}
      </aside>
      <main style={S.main}>
        <div style={S.crumb}>Patients / Pham, Tuan</div>
        <div style={S.bannerCard}>
          <div style={S.avatar}>TP</div>
          <div>
            <div style={S.pname}>
              Tuan Pham
              <span style={S.syn}>SYNTHETIC DATA</span>
            </div>
            <div style={S.pmeta}>
              Male · DOB {b?.dob || '1964-03-14'} (62y) · Berkeley, CA · {b?.payer || 'Commercial PPO'}
              {b?.medplumId ? ` · Medplum ${b.medplumId.slice(0, 8)}…` : ''}
            </div>
          </div>
          <button style={S.convene} onClick={convene} disabled={convening}>
            {convening ? 'Convening…' : '🩺 Convene Panel'}
          </button>
        </div>

        <div style={S.tabs}>
          {['Overview', 'Timeline', 'Labs', 'Medications', 'Documents'].map((t, i) => (
            <div key={t} style={{ ...S.tab, ...(i === 0 ? S.tabActive : {}) }}>{t}</div>
          ))}
        </div>

        {!chart && <div style={S.foot}>loading chart from Medplum…</div>}
        {chart?.error && <div style={{ ...S.foot, color: '#b3383e' }}>{chart.error}</div>}

        {groups.map((g) => (
          <div key={g.type} style={S.section}>
            <div style={S.secHead}>{g.type} · {g.rows.length}</div>
            {g.rows.slice(0, 8).map((r, i) => (
              <div key={i} style={S.row}>
                <span style={S.rowDate}>{r.date ? r.date.slice(0, 10) : '—'}</span>
                <span style={S.rowType}>{r.resourceType}</span>
                <span>{r.display}</span>
              </div>
            ))}
          </div>
        ))}

        <div style={S.foot}>Synthetic patient · YC × Medplum Agentic Healthcare Hackathon demo · records live from hosted Medplum</div>
      </main>
    </div>
  );
}
