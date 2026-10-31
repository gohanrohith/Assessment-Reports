'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { StaffAccessPanel, type StaffDraft } from './staff-access';
import type { StaffAccess, SchoolContext } from '../../../packages/contracts/src';
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
type BrowserSession = { accessToken: string; active_school_id: string | null };
export default function Home() {
  const [staff, setStaff] = useState<StaffDraft[]>([]);
  const tokenRef = useRef('');
  const activeRef = useRef<string | null>(null);
  const refreshInFlight = useRef<Promise<BrowserSession> | null>(null);
  const [currentPassword, setCurrentPassword] = useState(''),
    [newPassword, setNewPassword] = useState(''),
    [confirmPassword, setConfirmPassword] = useState(''),
    [passwordCode, setPasswordCode] = useState('');

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
  function updateToken(value: string) {
    tokenRef.current = value;
    setToken(value);
  }
  function clearAccountSecrets() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordCode('');
  }
  function clearSession() {
    updateToken('');
    activeRef.current = null;
    setActive(null);
    setSchools([]);
    setStaff([]);
    setProfile(empty);
    setDirty(false);
    setPassword('');
    setCode('');
    setEnrollment(null);
    clearAccountSecrets();
  }
  function refreshSession(): Promise<BrowserSession> {
    if (!refreshInFlight.current) {
      refreshInFlight.current = fetch('/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      })
        .then(async (res) => {
          if (!res.ok) {
            if (res.status === 401) clearSession();
            throw new Error(
              res.status === 401
                ? 'Session expired. Sign in again.'
                : 'Session renewal unavailable. Try again.',
            );
          }
          return res.json();
        })
        .finally(() => {
          refreshInFlight.current = null;
        });
    }
    return refreshInFlight.current;
  }
  async function request<T = unknown>(
    path: string,
    method = 'GET',
    body?: unknown,
    access = tokenRef.current,
    allowRenew = true,
  ): Promise<T> {
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
    if (
      res.status === 401 &&
      value.message === 'Session invalid or expired' &&
      access &&
      allowRenew
    ) {
      if (tokenRef.current === access) {
        const session = await refreshSession();
        if (session.active_school_id !== activeRef.current)
          throw new Error('School context changed in another tab. Reload before continuing.');
        updateToken(session.accessToken);
      }
      return request<T>(path, method, body, tokenRef.current, false);
    }
    if (!res.ok)
      throw new Error(
        Array.isArray(value.message)
          ? value.message.join('; ')
          : (value.message ?? 'Request failed'),
      );
    return value;
  }
  const staffDirty = staff.some(
    (row) => row.role !== row.expectedRole || row.active !== row.expectedActive,
  );
  const hasUnsavedChanges = dirty || staffDirty;
  const drafts = (rows: StaffAccess[]): StaffDraft[] =>
    rows.map((row) => ({ ...row, expectedRole: row.role, expectedActive: row.active }));
  async function accept(session: BrowserSession) {
    const list = await request<SchoolContext[]>(
      'auth/schools',
      'GET',
      undefined,
      session.accessToken,
    );
    const profile = session.active_school_id
      ? await request<Profile>(
          'schools/' + session.active_school_id,
          'GET',
          undefined,
          session.accessToken,
        )
      : empty;
    const admin = list.find((s) => s.id === session.active_school_id)?.role === 'SCHOOL_ADMIN';
    const staff = admin
      ? await request<StaffAccess[]>(
          'schools/' + session.active_school_id + '/staff-access',
          'GET',
          undefined,
          session.accessToken,
        )
      : [];
    // Apply the new context only after its profile and permissions have loaded.
    updateToken(session.accessToken);
    activeRef.current = session.active_school_id;
    setActive(session.active_school_id);
    setSchools(list);
    setProfile(profile);
    setStaff(drafts(staff));
    setDirty(false);
    clearAccountSecrets();
  }
  useEffect(() => {
    let mounted = true;
    refreshSession()
      .then(async (session) => {
        if (mounted) await accept(session);
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
      if (hasUnsavedChanges) event.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [hasUnsavedChanges]);
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
        await request<BrowserSession>(
          'auth/login',
          'POST',
          { email, password, ...(code ? { code } : {}) },
          '',
        ),
      );
      setPassword('');
      setCode('');
      setEnrollment(null);
    });
  }
  async function enroll() {
    await run(async () =>
      setEnrollment(
        await request<{ otpauthUrl: string; enrollmentToken: string }>(
          'auth/mfa/enroll',
          'POST',
          { email, password },
          '',
        ),
      ),
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
    if (
      hasUnsavedChanges &&
      !window.confirm('Discard unsaved school settings or staff access changes and switch schools?')
    )
      return;
    await run(async () =>
      accept(await request<BrowserSession>('auth/context-switch', 'POST', { schoolId: id })),
    );
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
  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (hasUnsavedChanges && !window.confirm('Discard unsaved settings and change your password?'))
      return;
    await run(async () => {
      await request('auth/password', 'POST', {
        currentPassword,
        newPassword,
        ...(passwordCode ? { code: passwordCode } : {}),
      });
      clearSession();
      setNotice('Password changed. All sessions signed out. Sign in with your new password.');
    });
  }
  async function saveStaff(row: StaffDraft) {
    await run(async () => {
      await request('schools/' + active + '/staff-access/' + row.id, 'PATCH', {
        role: row.role,
        active: row.active,
        expectedRole: row.expectedRole,
        expectedActive: row.expectedActive,
      });
      setStaff((current) =>
        current.map((item) =>
          item.id === row.id
            ? { ...item, expectedRole: row.role, expectedActive: row.active }
            : item,
        ),
      );
      setNotice('Staff access saved. Affected sessions were signed out.');
    });
  }
  async function reloadStaff() {
    if (staffDirty && !window.confirm('Discard unsaved staff access changes?')) return;
    await run(async () =>
      setStaff(drafts(await request<StaffAccess[]>('schools/' + active + '/staff-access'))),
    );
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
                  if (
                    hasUnsavedChanges &&
                    !window.confirm('Discard unsaved school settings and sign out?')
                  )
                    return;
                  await request('auth/logout', 'POST');
                  clearSession();
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
          {active && canEdit && (
            <StaffAccessPanel
              rows={staff}
              busy={busy}
              onChange={(id, patch) =>
                setStaff((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
              }
              onSave={(row) => void saveStaff(row)}
              onReload={() => void reloadStaff()}
            />
          )}
          <section aria-labelledby="account-security">
            <h2 id="account-security">Account security</h2>
            <p>Changing your password signs out every session. MFA remains enabled.</p>
            <form onSubmit={changePassword}>
              <label>
                Current password
                <input
                  type="password"
                  autoComplete="current-password"
                  minLength={12}
                  maxLength={72}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </label>
              <label>
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={72}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </label>
              <label>
                Confirm new password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={72}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </label>
              <label>
                Current authenticator code (if enabled)
                <input
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  autoComplete="one-time-code"
                  value={passwordCode}
                  onChange={(e) => setPasswordCode(e.target.value)}
                />
              </label>
              <button disabled={busy}>Change password</button>
            </form>
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
