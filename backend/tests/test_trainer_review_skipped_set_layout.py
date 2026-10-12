"""Skipped trainer review sets: accessible, compact status with no overlapping metadata."""
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[2]
RESULTS=(ROOT/"backend/static/js/results.js").read_text(encoding="utf-8")
CSS=(ROOT/"backend/static/css/redesign.css").read_text(encoding="utf-8")
INDEX=(ROOT/"backend/static/index.html").read_text(encoding="utf-8")
SW=(ROOT/"backend/static/sw.js").read_text(encoding="utf-8")


class TrainerReviewSkippedSetLayoutTests(unittest.TestCase):
    def test_skipped_status_uses_own_two_column_layout(self):
        code=RESULTS.split("function trainerReviewExerciseRowsHTML(",1)[1].split(
            "function trainerPendingReviewsHTML(",1)[0]
        self.assertIn('trainer-review-set-current skipped',code)
        self.assertIn('trainer-review-skipped-badge',code)
        self.assertIn('aria-label="Клієнт не виконував цей підхід"',code)
        self.assertNotIn('trainer-review-set-current trainer-review-set skipped',code)
        rules=CSS.split("/* v262 — trainer review skipped-set readability",1)[1]
        self.assertIn("grid-template-columns:minmax(0,1fr) auto!important",rules)
        self.assertIn("justify-self:end!important",rules)
        self.assertIn(".trainer-review-skipped-badge",rules)
        self.assertIn("white-space:nowrap!important",rules)

    def test_asset_cache_versions(self):
        for shell in (INDEX,SW):
            self.assertIn("/static/js/results.js?v=181",shell)
            self.assertIn("/static/css/redesign.css?v=262",shell)
        self.assertIn("const VERSION='eplan-v221'",SW)

    @unittest.skipUnless(shutil.which("node"),"Node.js required")
    def test_render_skips_cleanly_without_changing_completed_set(self):
        script=r"""
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('backend/static/js/results.js','utf8');
const start=src.indexOf('function trainerReviewExerciseRowsHTML(');
const end=src.indexOf('function trainerPendingReviewsHTML(',start);
assert(start>0&&end>start);
const ctx={
  console,
  sessionDay:s=>s.day,
  sessionProgramForDate:(d)=>d.program,
  uniqueResultSets:a=>a,
  normalizeRepeatMode:m=>m||'total',
  repeatResultText:r=>String(r),
  esc:x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;'),
  formatSetRest:s=>String(s),
  fmtProgress:s=>String(s)
};
vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
const d={
 program:[{id:10,exercise:'Згинання ніг',day_name:'День 6'},
          {id:20,exercise:'Присідання',day_name:'День 6'}],
 result_sets:[{day:'2026-10-10',program_id:20,exercise:'Присідання',set_number:1,weight:80,reps:4,rir:2}],
 skipped_sets:[1,2,3].map(set_number=>({day:'2026-10-10',program_id:10,exercise:'Згинання ніг',set_number})),
 timed_result_sets:[],aux_sets:[]
};
const html=ctx.trainerReviewExerciseRowsHTML(d,{day:'2026-10-10',day_name:'День 6'});
assert.equal((html.match(/trainer-review-skipped-badge/g)||[]).length,3);
assert.equal((html.match(/trainer-review-set-current skipped/g)||[]).length,3);
assert(!html.includes('trainer-review-set-current trainer-review-set skipped'));
assert(!html.includes('<span class="trainer-review-rir">Клієнт не виконував цей підхід'));
assert(html.includes('aria-label="Клієнт не виконував цей підхід"'));
assert(html.includes('Пропущено'));
assert(html.includes('80 кг × 4'),'ordinary saved result remains intact');
assert(html.includes('RIR 2'),'ordinary result RIR remains intact');
console.log('Skipped sets use single badge; completed set still shows kg, reps and RIR PASS');
"""
        p=subprocess.run(["node","-e",script],cwd=ROOT,capture_output=True,text=True)
        self.assertEqual(p.returncode,0,p.stdout+"\n"+p.stderr)


if __name__=="__main__":
    unittest.main()
