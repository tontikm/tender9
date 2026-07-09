"use client";

import { useState, useTransition } from "react";
import {
  STANDARD_CHECKLIST,
  checklistProgress,
  type CustomTask,
  type WorkspaceChecklist,
} from "@/lib/bid-workspace";
import { saveWorkspace } from "./actions";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function BidWorkspace({
  tenderId,
  initialChecklist,
  initialNotes,
}: {
  tenderId: string;
  initialChecklist: WorkspaceChecklist;
  initialNotes: string;
}) {
  const [done, setDone] = useState<Record<string, boolean>>(initialChecklist.done);
  const [custom, setCustom] = useState<CustomTask[]>(initialChecklist.custom);
  const [notes, setNotes] = useState(initialNotes);
  const [newTask, setNewTask] = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [, startTransition] = useTransition();

  const persist = (
    nextDone: Record<string, boolean>,
    nextCustom: CustomTask[],
    nextNotes: string
  ) => {
    setStatus("saving");
    startTransition(async () => {
      const res = await saveWorkspace(tenderId, { done: nextDone, custom: nextCustom }, nextNotes);
      setStatus(res.ok ? "saved" : "error");
    });
  };

  const toggleStandard = (id: string) => {
    const nextDone = { ...done, [id]: !done[id] };
    setDone(nextDone);
    persist(nextDone, custom, notes);
  };

  const toggleCustom = (id: string) => {
    const nextCustom = custom.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    setCustom(nextCustom);
    persist(done, nextCustom, notes);
  };

  const addCustom = () => {
    const label = newTask.trim();
    if (!label) return;
    const nextCustom = [...custom, { id: crypto.randomUUID(), label, done: false }];
    setCustom(nextCustom);
    setNewTask("");
    persist(done, nextCustom, notes);
  };

  const removeCustom = (id: string) => {
    const nextCustom = custom.filter((t) => t.id !== id);
    setCustom(nextCustom);
    persist(done, nextCustom, notes);
  };

  const progress = checklistProgress({ done, custom });
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  const statusLabel =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "All changes saved"
        : status === "error"
          ? "Couldn't save — check your connection"
          : "";

  return (
    <div className="workspace">
      <div className="workspace-progress">
        <div className="workspace-progress-top">
          <span className="workspace-progress-label">
            {progress.done} of {progress.total} complete
          </span>
          <span className={`workspace-save-status ${status === "error" ? "error" : ""}`}>
            {statusLabel}
          </span>
        </div>
        <div className="workspace-progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="workspace-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {STANDARD_CHECKLIST.map((group) => (
        <section className="workspace-group" key={group.heading}>
          <h3 className="workspace-group-heading">{group.heading}</h3>
          <ul className="workspace-items">
            {group.items.map((item) => (
              <li key={item.id}>
                <label className={`workspace-item ${done[item.id] ? "checked" : ""}`}>
                  <input
                    type="checkbox"
                    checked={!!done[item.id]}
                    onChange={() => toggleStandard(item.id)}
                  />
                  <span>{item.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="workspace-group">
        <h3 className="workspace-group-heading">Your own tasks</h3>
        <ul className="workspace-items">
          {custom.map((task) => (
            <li key={task.id} className="workspace-custom-row">
              <label className={`workspace-item ${task.done ? "checked" : ""}`}>
                <input type="checkbox" checked={task.done} onChange={() => toggleCustom(task.id)} />
                <span>{task.label}</span>
              </label>
              <button
                type="button"
                className="workspace-custom-remove"
                aria-label={`Remove ${task.label}`}
                onClick={() => removeCustom(task.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="workspace-custom-add">
          <input
            type="text"
            value={newTask}
            placeholder="Add a task (e.g. attach product datasheet)"
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <button type="button" onClick={addCustom}>
            Add
          </button>
        </div>
      </section>

      <section className="workspace-group">
        <h3 className="workspace-group-heading">Notes</h3>
        <textarea
          className="workspace-notes"
          rows={4}
          value={notes}
          placeholder="Contact person, briefing details, pricing reminders, anything for this bid…"
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => persist(done, custom, notes)}
        />
      </section>
    </div>
  );
}
