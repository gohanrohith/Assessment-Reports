'use client';
import { staffRoles, type StaffAccess } from '../../../packages/contracts/src';
export type StaffDraft = StaffAccess & {
  expectedRole: StaffAccess['role'];
  expectedActive: boolean;
};
export function StaffAccessPanel({
  rows,
  busy,
  onChange,
  onSave,
  onReload,
}: {
  rows: StaffDraft[];
  busy: boolean;
  onChange: (id: string, patch: Partial<Pick<StaffDraft, 'role' | 'active'>>) => void;
  onSave: (row: StaffDraft) => void;
  onReload: () => void;
}) {
  return (
    <section aria-labelledby="staff-access">
      <h2 id="staff-access">Staff access</h2>
      <p>
        Manage existing staff in the active school. Role changes sign affected sessions out. New
        accounts are provisioned by an authorised operator.
      </p>
      <button type="button" className="secondary" disabled={busy} onClick={onReload}>
        Reload staff access
      </button>
      {rows.map((row) => (
        <fieldset key={row.id} disabled={busy || row.isSelf}>
          <legend>
            {row.email}
            {row.isSelf ? ' (your account)' : ''}
          </legend>
          <label>
            {row.email} role
            <select
              value={row.role}
              onChange={(e) => onChange(row.id, { role: e.target.value as StaffAccess['role'] })}
            >
              {staffRoles.map((role) => (
                <option key={role} value={role}>
                  {role.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              className="toggle"
              type="checkbox"
              checked={row.active}
              onChange={(e) => onChange(row.id, { active: e.target.checked })}
            />
            {row.email} active
          </label>
          <button
            type="button"
            disabled={
              busy ||
              row.isSelf ||
              (row.role === row.expectedRole && row.active === row.expectedActive)
            }
            onClick={() => onSave(row)}
          >
            Save access for {row.email}
          </button>
          {row.isSelf && <p>Another administrator must change your access.</p>}
        </fieldset>
      ))}
    </section>
  );
}
