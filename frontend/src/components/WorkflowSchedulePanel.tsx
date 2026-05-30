import { useEffect, useState } from "react";
import { api, WorkflowSchedule } from "../api";

type Props = {
  workflowId: string;
  workflowName: string;
};

function defaultOnceLocal(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(s: WorkflowSchedule): string {
  if (s.schedule_type === "once" && s.scheduled_at) {
    return `Once at ${new Date(s.scheduled_at).toLocaleString()}`;
  }
  if (s.schedule_type === "interval" && s.interval_minutes) {
    return `Every ${s.interval_minutes} min`;
  }
  return s.schedule_type;
}

export default function WorkflowSchedulePanel({ workflowId, workflowName }: Props) {
  const [schedules, setSchedules] = useState<WorkflowSchedule[]>([]);
  const [scheduleType, setScheduleType] = useState<"once" | "interval">("once");
  const [task, setTask] = useState(`Scheduled run for ${workflowName}`);
  const [scheduledAtLocal, setScheduledAtLocal] = useState(defaultOnceLocal);
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.schedules.list(workflowId).then(setSchedules);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [workflowId]);

  const createSchedule = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.schedules.create({
        workflow_id: workflowId,
        input_task: task,
        schedule_type: scheduleType,
        scheduled_at:
          scheduleType === "once" ? new Date(scheduledAtLocal).toISOString() : undefined,
        interval_minutes: scheduleType === "interval" ? intervalMinutes : undefined,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create schedule");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (s: WorkflowSchedule) => {
    await api.schedules.update(s.id, { enabled: !s.enabled });
    load();
  };

  const remove = async (s: WorkflowSchedule) => {
    if (!confirm("Delete this schedule?")) return;
    await api.schedules.delete(s.id);
    load();
  };

  return (
    <div className="workflow-schedule-panel">
      <h3 className="workflow-assign-title">Schedule execution</h3>
      <p className="workflow-actions-hint">
        Run this workflow automatically at a set time or on a repeating interval. The worker
        checks every ~60 seconds.
      </p>

      <label>Task for scheduled runs</label>
      <textarea rows={2} value={task} onChange={(e) => setTask(e.target.value)} />

      <label>Schedule type</label>
      <select
        value={scheduleType}
        onChange={(e) => setScheduleType(e.target.value as "once" | "interval")}
      >
        <option value="once">Run once at a specific time</option>
        <option value="interval">Repeat every N minutes</option>
      </select>

      {scheduleType === "once" ? (
        <>
          <label>Run at (local time)</label>
          <input
            type="datetime-local"
            value={scheduledAtLocal}
            onChange={(e) => setScheduledAtLocal(e.target.value)}
          />
        </>
      ) : (
        <>
          <label>Interval (minutes)</label>
          <input
            type="number"
            min={1}
            max={525600}
            value={intervalMinutes}
            onChange={(e) => setIntervalMinutes(Number(e.target.value) || 60)}
          />
        </>
      )}

      {error && <p className="run-chat-error">{error}</p>}

      <button type="button" className="btn" onClick={createSchedule} disabled={saving || !task.trim()}>
        Add schedule
      </button>

      {schedules.length > 0 && (
        <ul className="workflow-schedule-list">
          {schedules.map((s) => (
            <li key={s.id} className="workflow-schedule-row">
              <div>
                <strong>{formatWhen(s)}</strong>
                <span className={`badge ${s.enabled ? "completed" : ""}`} style={{ marginLeft: "0.5rem" }}>
                  {s.enabled ? "active" : "paused"}
                </span>
                <p className="workflow-schedule-task">{s.input_task.slice(0, 120)}</p>
                <p className="workflow-schedule-meta">
                  {s.next_run_at && s.enabled
                    ? `Next: ${new Date(s.next_run_at).toLocaleString()}`
                    : s.last_run_at
                      ? `Last run: ${new Date(s.last_run_at).toLocaleString()}`
                      : "Completed"}
                </p>
              </div>
              <div className="workflow-actions-buttons">
                <button type="button" className="btn btn-secondary" onClick={() => toggleEnabled(s)}>
                  {s.enabled ? "Pause" : "Resume"}
                </button>
                <button type="button" className="btn btn-danger" onClick={() => remove(s)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
