import type Database from 'better-sqlite3'

/** Explicit disposal of an unreadable task, never of its saved domain results. */
export function deleteGenerationHistory(db: Database.Database, runId: string, rootActionId: string): void {
  db.transaction(() => {
    // A completed recheck still needs its attempt as a formal proof.
    if (db.prepare(`SELECT 1 FROM review_cycles WHERE recheck_attempt_id IN
      (SELECT attempt_id FROM generation_attempts WHERE run_id=?)`).get(runId))
      throw new Error('GENERATION_HISTORY_DELETE_REFERENCED')
    // Other tasks may hold a source handle or artifact from this task.
    if (db.prepare(`SELECT 1 FROM generation_runs r, json_tree(r.binding_json) j
      WHERE r.run_id<>? AND j.type='text' AND (j.value=? OR j.value IN
        (SELECT artifact_id FROM generation_artifacts WHERE run_id=?)) LIMIT 1`).get(runId, runId, runId))
      throw new Error('GENERATION_HISTORY_DELETE_REFERENCED')
    db.prepare('DELETE FROM generation_artifacts WHERE run_id=?').run(runId)
    db.prepare('DELETE FROM generation_attempts WHERE run_id=?').run(runId)
    db.prepare('DELETE FROM generation_runs WHERE run_id=?').run(runId)
    // Keep a root only when existing tasks or saved review-cycle facts still reference it.
    db.prepare(`DELETE FROM generation_roots WHERE root_action_id=?
      AND NOT EXISTS(SELECT 1 FROM generation_runs WHERE root_action_id=?)
      AND NOT EXISTS(SELECT 1 FROM review_cycles WHERE root_action_id=?)`).run(rootActionId, rootActionId, rootActionId)
  }).immediate()
}
