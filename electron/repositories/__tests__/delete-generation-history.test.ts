import { createRequire } from 'node:module'
import { afterEach, expect, it } from 'vitest'
import { M01_GENERATION_SQL } from '../../migrations/m01-generation-runs'
import { deleteGenerationHistory } from '../delete-generation-history'

const Database = createRequire(import.meta.url)('better-sqlite3') as typeof import('better-sqlite3')
const databases: import('better-sqlite3').Database[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close() })

function fixture() {
  const db = new Database(':memory:')
  databases.push(db)
  db.pragma('foreign_keys=ON')
  db.exec(M01_GENERATION_SQL)
  db.exec(`CREATE TABLE reviews(id INTEGER PRIMARY KEY, content TEXT);
    CREATE TABLE drafts(id INTEGER PRIMARY KEY, content TEXT);
    CREATE TABLE review_cycles(root_action_id TEXT REFERENCES generation_roots(root_action_id),
      recheck_attempt_id TEXT REFERENCES generation_attempts(attempt_id));
    INSERT INTO generation_roots(root_action_id,idempotency_key,action_json,budget_json) VALUES('root','key','{}','{}');
    INSERT INTO generation_runs VALUES('run','root','{}','paused',1,'open');
    INSERT INTO generation_attempts VALUES('attempt','reservation','run','root','{}','{}','nonce');
    INSERT INTO generation_artifacts VALUES('artifact','attempt','run','{}',1,'partial');
    INSERT INTO reviews VALUES(1,'Saved report'); INSERT INTO drafts VALUES(1,'Current draft');`)
  return db
}

it('deletes task rows and keeps saved reports and roots needed by review cycles', () => {
  const db = fixture()
  db.exec("INSERT INTO review_cycles VALUES('root',NULL)")
  deleteGenerationHistory(db, 'run', 'root')
  expect(db.prepare('SELECT * FROM generation_runs').all()).toEqual([])
  expect(db.prepare('SELECT * FROM generation_attempts').all()).toEqual([])
  expect(db.prepare('SELECT * FROM generation_artifacts').all()).toEqual([])
  expect(db.prepare('SELECT COUNT(*) FROM generation_roots').pluck().get()).toBe(1)
  expect(db.prepare('SELECT content FROM reviews').pluck().get()).toBe('Saved report')
  expect(db.prepare('SELECT content FROM drafts').pluck().get()).toBe('Current draft')
})

it.each(['recheck', 'source'] as const)('refuses deletion referenced by a %s without partial cleanup', reference => {
  const db = fixture()
  if (reference === 'recheck') db.exec("INSERT INTO review_cycles VALUES('root','attempt')")
  else db.prepare('INSERT INTO generation_runs VALUES(?,?,?,?,?,?)').run('other', 'root', JSON.stringify({ source: { runId: 'run' } }), 'paused', 2, 'other-open')
  expect(() => deleteGenerationHistory(db, 'run', 'root')).toThrow('GENERATION_HISTORY_DELETE_REFERENCED')
  expect(db.prepare('SELECT COUNT(*) FROM generation_artifacts').pluck().get()).toBe(1)
  expect(db.prepare('SELECT COUNT(*) FROM generation_attempts').pluck().get()).toBe(1)
  expect(db.prepare("SELECT 1 FROM generation_runs WHERE run_id='run'").get()).toBeDefined()
})

it('rolls back fragments and attempts when a later deletion fails', () => {
  const db = fixture()
  db.exec("CREATE TRIGGER refuse_history_delete BEFORE DELETE ON generation_runs BEGIN SELECT RAISE(ABORT,'refused'); END")
  expect(() => deleteGenerationHistory(db, 'run', 'root')).toThrow('refused')
  expect(db.prepare('SELECT COUNT(*) FROM generation_artifacts').pluck().get()).toBe(1)
  expect(db.prepare('SELECT COUNT(*) FROM generation_attempts').pluck().get()).toBe(1)
})
