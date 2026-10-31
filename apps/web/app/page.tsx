'use client';
import { useEffect, useState, type FormEvent } from 'react';
import type { SchoolContext } from '../../../packages/contracts/src';
type Profile = {
  id?: string;
  legalName: string;
  displayName: string;
  locale: string;
  timezone: string;
  academicYear: string;
  board: string;
  country: string;
  state: string;
  address: string;
  contactEmail: string;
  logoUrl?: string;
  campuses: string[];
};
const empty: Profile = {
  legalName: '',
  displayName: '',
  locale: 'en-IN',
  timezone: 'Asia/Kolkata',
  academicYear: '2026-2027',
  board: '',
  country: 'IN',
  state: '',
  address: '',
  contactEmail: '',
  campuses: [],
};
export default function Home() {
  const [token, setToken] = useState(''),
    [schools, setSchools] = useState<SchoolContext[]>([]),
    [active, setActive] = useState<string | null>(null);
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const [enrollment, setEnrollment] = useState<{
    otpauthUrl: string;
    enrollmentToken: string;
  } | null>(null);
  const [profile, setProfile] = useState<Profile>(empty),
    [dirty, setDirty] = useState(false);
  async function request(path: string, method = 'GET', body?: unknown, access = token) {
    const res = await fetch('/v1/' + path, {
      method,
      credentials: 'include',
      headers: {
        ...(access ? { Authorization: 'Bearer ' + access } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const value = await res.json();
    if (!res.ok)
      throw new Error(
        Array.isArray(value.message)
          ? value.message.join('; ')
          : (value.message ?? 'Request failed'),
      );
    return value;
  }
  async function accept(session: { accessToken: string; active_school_id: string | null }) {
    setToken(session.accessToken);
    setActive(session.active_school_id);
    const list: SchoolContext[] = await request(
      'auth/schools',
      'GET',
      undefined,
      session.accessToken,
    );
    setSchools(list);
    if (session.active_school_id) {
      const p = await request(
        'schools/' + session.active_school_id,
        'GET',
        undefined,
        session.accessToken,
      );
      setProfile(p);
    } else setProfile(empty);
    setDirty(false);
  }
  useEffect(() => {
    let mounted = true;
    fetch('/v1/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        if (res.ok && mounted) await accept(await res.json());
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []); // Token stays in memory; refresh cookie restores a session.
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  async function login(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await accept(
        await request('auth/login', 'POST', { email, password, ...(code ? { code } : {}) }, ''),
      );
      setPassword('');
      setCode('');
    });
  }
  async function enroll() {
    await run(async () =>
      setEnrollment(await request('auth/mfa/enroll', 'POST', { email, password }, '')),
    );
  }
  async function confirm() {
    await run(async () => {
      await request(
        'auth/mfa/confirm',
        'POST',
        { enrollmentToken: enrollment?.enrollmentToken, code },
        '',
      );
      setEnrollment(null);
      setCode('');
      setNotice('MFA enabled. Sign in with the next authenticator code.');
    });
  }
  async function switchSchool(id: string) {
    if (dirty && !window.confirm('Discard unsaved school settings and switch schools?')) return;
    await run(async () => accept(await request('auth/context-switch', 'POST', { schoolId: id })));
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const { id: _id, ...data } = profile;
      const payload = Object.fromEntries(
        Object.entries(data).filter(([key]) =>
          [
            'legalName',
            'displayName',
            'locale',
            'timezone',
            'academicYear',
            'board',
            'country',
            'state',
            'address',
            'contactEmail',
            'logoUrl',
            'campuses',
          ].includes(key),
        ),
      );
      await request(active ? 'schools/' + active : 'schools', active ? 'PATCH' : 'POST', payload);
      setDirty(false);
      setNotice(
        active
          ? 'School settings saved.'
          : 'School provisioned. Assign staff using the operator runbook.',
      );
      if (!active) setProfile(empty);
    });
  }
  const canEdit = !active || schools.find((s) => s.id === active)?.role === 'SCHOOL_ADMIN';
  return (
    <main>
      <header>
        <span className="eyebrow">ACADEMIC PASSPORT</span>
        <h1>{token ? 'School workspace' : 'Welcome to your school workspace'}</h1>
        <p>Assessment and academic continuity, with each school in its own secure context.</p>
      </header>
      {!ready ? (
        <p role="status">Restoring session…</p>
      ) : !token ? (
        <section aria-labelledby="signin">
          <h2 id="signin">Sign in</h2>
          <form onSubmit={login}>
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                minLength={12}
                maxLength={72}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label>
              Authenticator code
              <input
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <button disabled={busy}>Sign in</button>
            <button
              type="button"
              className="secondary"
              disabled={busy || !email || password.length < 12}
              onClick={enroll}
            >
              Set up authenticator
            </button>
          </form>
          {enrollment && (
            <aside>
              <h3>Connect your authenticator</h3>
              <p>Add this setup URI to an RFC 6238 authenticator. Keep it private.</p>
              <code className="secret">{enrollment.otpauthUrl}</code>
              <button disabled={busy || code.length !== 6} onClick={confirm}>
                Confirm code
              </button>
            </aside>
          )}
        </section>
      ) : (
        <>
          <nav aria-label="School context">
            <label>
              Active school
              <select
                aria-label="Active school"
                disabled={busy}
                value={active ?? ''}
                onChange={(e) => void switchSchool(e.target.value)}
              >
                {!active && <option value="">Platform operations</option>}
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName} · {s.role.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (dirty && !window.confirm('Discard unsaved school settings and sign out?'))
                    return;
                  await request('auth/logout', 'POST');
                  setToken('');
                  setSchools([]);
                  setProfile(empty);
                  setDirty(false);
                })
              }
            >
              Sign out
            </button>
          </nav>
          <section>
            <h2>{active ? 'School profile' : 'Provision school'}</h2>
            <p>
              {active
                ? 'Settings apply only to the active school.'
                : 'Platform operators can provision a school without access to student records.'}
            </p>
            <form onSubmit={save}>
              <fieldset disabled={busy || !canEdit}>
                {(
                  [
                    'legalName',
                    'displayName',
                    'academicYear',
                    'board',
                    'country',
                    'state',
                    'address',
                    'contactEmail',
                    'timezone',
                  ] as const
                ).map((field) => (
                  <label key={field}>
                    {
                      {
                        legalName: 'Legal name',
                        displayName: 'Display name',
                        academicYear: 'Academic year',
                        board: 'Board',
                        country: 'Country code',
                        state: 'State',
                        address: 'Address',
                        contactEmail: 'Contact email',
                        timezone: 'Timezone',
                      }[field]
                    }
                    <input
                      required
                      type={field === 'contactEmail' ? 'email' : 'text'}
                      value={profile[field]}
                      onChange={(e) => {
                        setProfile({ ...profile, [field]: e.target.value });
                        setDirty(true);
                      }}
                    />
                  </label>
                ))}
                <label>
                  Language
                  <select
                    value={profile.locale}
                    onChange={(e) => {
                      setProfile({ ...profile, locale: e.target.value });
                      setDirty(true);
                    }}
                  >
                    <option value="en-IN">English (India)</option>
                    <option value="te-IN">Telugu (India)</option>
                  </select>
                </label>
                <label>
                  Logo URL (HTTPS)
                  <input
                    type="url"
                    value={profile.logoUrl ?? ''}
                    onChange={(e) => {
                      setProfile({ ...profile, logoUrl: e.target.value || undefined });
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Campuses (one per line)
                  <textarea
                    value={profile.campuses.join('\n')}
                    onChange={(e) => {
                      setProfile({
                        ...profile,
                        campuses: e.target.value.split('\n').filter(Boolean),
                      });
                      setDirty(true);
                    }}
                  />
                </label>
                {canEdit && (
                  <button disabled={!dirty || busy}>
                    {active ? 'Save settings' : 'Provision school'}
                  </button>
                )}
              </fieldset>
            </form>
            {!canEdit && (
              <p>Your role can view this profile. School administrators manage its settings.</p>
            )}
          </section>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <footer>
        Foundation milestone · Assessment and report workflows arrive in later milestones.
      </footer>
    </main>
  );
}
