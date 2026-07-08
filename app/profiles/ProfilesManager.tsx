"use client";

import { useActionState, useEffect, useState } from "react";
import { saveProfile, deleteProfile, type SaveProfileState } from "./actions";

const SA_PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Western Cape",
];

export interface Profile {
  id: string;
  name: string;
  keywords: string[] | null;
  categories: string[] | null;
  provinces: string[] | null;
  min_value: number | null;
  max_value: number | null;
  cidb_grade: string | null;
  active: boolean;
}

const INITIAL_STATE: SaveProfileState = { ok: false, error: null };

function summarize(profile: Profile): string {
  const parts: string[] = [];
  const kw = profile.keywords?.length ?? 0;
  if (kw) parts.push(`${kw} keyword${kw === 1 ? "" : "s"}`);
  const cat = profile.categories?.length ?? 0;
  if (cat) parts.push(`${cat} categor${cat === 1 ? "y" : "ies"}`);
  parts.push(profile.provinces?.length ? profile.provinces.join(", ") : "National");
  if (profile.max_value != null) {
    parts.push(`up to R${profile.max_value.toLocaleString("en-ZA")}`);
  }
  return parts.join(" · ") || "No criteria set";
}

function ProfileEditor({
  profile,
  availableCategories,
  onDone,
}: {
  profile: Profile | null;
  availableCategories: string[];
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(saveProfile, INITIAL_STATE);
  const formId = `profile-form-${profile?.id ?? "new"}`;
  const selectedCategories = new Set(profile?.categories ?? []);
  const selectedProvinces = new Set(profile?.provinces ?? []);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <>
      <form action={formAction} className="profile-card-form" id={formId}>
        {profile && <input type="hidden" name="id" value={profile.id} />}
        <div className="form-grid">
          <div className="form-field full">
            <label>Profile name</label>
            <input type="text" name="name" defaultValue={profile?.name ?? ""} required />
          </div>

          <div className="form-field full">
            <label>Keywords (one per line)</label>
            <textarea name="keywords" rows={4} defaultValue={profile?.keywords?.join("\n") ?? ""} />
            <span className="hint">Matched against tender title (2 pts) and description (1 pt).</span>
          </div>

          <div className="form-field full">
            <label>Categories</label>
            <div className="checkbox-list">
              {availableCategories.map((category) => {
                const checkboxId = `${formId}-category-${category}`;
                return (
                  <span className="checkbox-list-item" key={category}>
                    <input
                      type="checkbox"
                      name="categories"
                      value={category}
                      id={checkboxId}
                      defaultChecked={selectedCategories.has(category)}
                    />
                    <label htmlFor={checkboxId}>{category}</label>
                  </span>
                );
              })}
            </div>
            <span className="hint">Select the tender categories relevant to your business (+2 pts on match).</span>
          </div>

          <div className="form-field full">
            <label>Provinces (leave all unchecked for national)</label>
            <div className="checkbox-list checkbox-list-inline">
              {SA_PROVINCES.map((province) => {
                const checkboxId = `${formId}-province-${province}`;
                return (
                  <span className="checkbox-list-item" key={province}>
                    <input
                      type="checkbox"
                      name="provinces"
                      value={province}
                      id={checkboxId}
                      defaultChecked={selectedProvinces.has(province)}
                    />
                    <label htmlFor={checkboxId}>{province}</label>
                  </span>
                );
              })}
            </div>
          </div>

          <div className="form-field">
            <label>Min value (ZAR)</label>
            <input type="number" name="min_value" defaultValue={profile?.min_value ?? ""} />
          </div>

          <div className="form-field">
            <label>Max value (ZAR)</label>
            <input type="number" name="max_value" defaultValue={profile?.max_value ?? ""} />
          </div>

          <div className="form-field">
            <label>CIDB grade</label>
            <input type="text" name="cidb_grade" defaultValue={profile?.cidb_grade ?? ""} />
          </div>

          <div className="form-field">
            <label>&nbsp;</label>
            <span className="form-field-inline">
              <input
                type="checkbox"
                name="active"
                id={`active-${profile?.id ?? "new"}`}
                defaultChecked={profile?.active ?? true}
              />
              <label htmlFor={`active-${profile?.id ?? "new"}`}>Active</label>
            </span>
          </div>
        </div>
      </form>

      {state.error && <p className="auth-error">{state.error}</p>}

      <div className="form-footer">
        <div className="form-footer-left">
          {profile && (
            <form action={deleteProfile.bind(null, profile.id)}>
              <button type="submit" className="delete-button">
                Delete profile
              </button>
            </form>
          )}
          <button type="button" className="cancel-button" onClick={onDone}>
            Cancel
          </button>
        </div>
        <button type="submit" form={formId}>
          {profile ? "Save changes" : "Add profile"}
        </button>
      </div>
    </>
  );
}

function ExistingProfileRow({
  profile,
  availableCategories,
}: {
  profile: Profile;
  availableCategories: string[];
}) {
  const [editing, setEditing] = useState(false);

  return (
    <article className={`profile-card ${profile.active ? "" : "inactive"}`}>
      {editing ? (
        <ProfileEditor
          profile={profile}
          availableCategories={availableCategories}
          onDone={() => setEditing(false)}
        />
      ) : (
        <button type="button" className="profile-summary" onClick={() => setEditing(true)}>
          <span className="profile-summary-main">
            <span className="profile-summary-name">{profile.name}</span>
            <span className="profile-summary-meta">{summarize(profile)}</span>
          </span>
          <span className="profile-summary-actions">
            {!profile.active && <span className="badge status-dismissed">Inactive</span>}
            <span className="profile-summary-edit">Edit</span>
          </span>
        </button>
      )}
    </article>
  );
}

function AddProfile({ availableCategories }: { availableCategories: string[] }) {
  const [adding, setAdding] = useState(false);

  if (!adding) {
    return (
      <button type="button" className="add-profile-button" onClick={() => setAdding(true)}>
        + Add a new profile
      </button>
    );
  }

  return (
    <article className="profile-card">
      <h3 style={{ marginTop: 0 }}>Add a new profile</h3>
      <ProfileEditor
        profile={null}
        availableCategories={availableCategories}
        onDone={() => setAdding(false)}
      />
    </article>
  );
}

export function ProfilesManager({
  profiles,
  availableCategories,
}: {
  profiles: Profile[];
  availableCategories: string[];
}) {
  return (
    <>
      {profiles.map((profile) => (
        <ExistingProfileRow key={profile.id} profile={profile} availableCategories={availableCategories} />
      ))}
      <AddProfile availableCategories={availableCategories} />
    </>
  );
}
