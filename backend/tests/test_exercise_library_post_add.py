"""Exercise library should remain usable after saving a new exercise."""
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[2]
LIB=(ROOT/"backend/static/js/library.js").read_text(encoding="utf-8")
INDEX=(ROOT/"backend/static/index.html").read_text(encoding="utf-8")
SW=(ROOT/"backend/static/sw.js").read_text(encoding="utf-8")

class ExerciseLibraryPostAddTests(unittest.TestCase):
    def test_screen_and_cache_contracts(self):
        self.assertIn("await showExerciseLibrary({openGroupId:gid,openAddForm:true})",LIB)
        self.assertIn("window.librarySearch=''",LIB)
        self.assertIn("window.libraryGroupFilter=0",LIB)
        self.assertIn("window.libraryMuscleFilter=0",LIB)
        self.assertIn("window.libraryScopeFilter='all'",LIB)
        self.assertIn("groupBody?.classList.remove('hidden')",LIB)
        self.assertIn("addBody?.classList.remove('hidden')",LIB)
        self.assertIn("renderId!==window.__libraryRenderId",LIB)
        self.assertIn("!groupFilter||+x.group_id===groupFilter",LIB)
        for page in (INDEX,SW):
            self.assertIn("/static/js/library.js?v=164",page)
        self.assertIn("const VERSION='eplan-v226'",SW)

    @unittest.skipUnless(shutil.which("node"),"Requires Node.js")
    def test_adding_two_exercises_never_loses_list_or_next_form(self):
        js=r"""
const fs=require('fs'),vm=require('vm'),assert=require('assert');
let exercises=[
 {id:1,group_id:1,name:'Тяга штанги',scope:'platform',primary_muscle_ids:[],secondary_muscle_ids:[]},
 {id:2,group_id:2,name:'Присідання',scope:'trainer',primary_muscle_ids:[],secondary_muscle_ids:[]}
];
const groups=[{id:1,name:'Спина'},{id:2,name:'Ноги'}];
const makeEl=()=>{
 const classes=new Set(['hidden']);
 return {
  classList:{contains:c=>classes.has(c),remove:c=>classes.delete(c),
             add:c=>classes.add(c)},
  previousElementSibling:{classList:{add:()=>{}}},
  scrollIntoView(){this.scrolled=true}
 };
};
const groupBody=makeEl(),addBody=makeEl(),app={innerHTML:''};
const inputs={'#libName2':{value:'Болгарські випади'},'#libUrl2':{value:''}};
const ctx={
 console,window:{libraryGroupFilter:999,libraryMuscleFilter:777,
 libraryScopeFilter:'invalid',librarySearch:''},
 document:{getElementById(id){
   if(id==='libGroup2')return groupBody;
   if(id==='libAdd2')return addBody;
   return null;
 },querySelectorAll:()=>[]},
 app,session:{user_id:2},
 uiIcon:()=>'',esc:x=>String(x),
 safeTechniqueUrl:x=>String(x),
 techniqueLinkHTML:()=>'',shell:x=>x,
 $:q=>inputs[q]||null,
 api:async (url,opt={})=>{
  if(url==='/exercise-library')return {groups,muscles:[],exercises:exercises.map(x=>({...x}))};
  if(url==='/exercise-library/exercises'&&opt.method==='POST'){
   const d=JSON.parse(opt.body);
   exercises.push({id:exercises.length+1,group_id:d.group_id,
      name:d.name,scope:'trainer',primary_muscle_ids:d.primary_muscle_ids,
      secondary_muscle_ids:d.secondary_muscle_ids});
   return {id:exercises.length};
  }
  throw Error('Unexpected API '+url);
 }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('backend/static/js/library.js','utf8'),ctx);
(async()=>{
 await ctx.showExerciseLibrary();
 assert.equal(ctx.window.libraryGroupFilter,0);
 assert.equal(ctx.window.libraryMuscleFilter,0);
 assert.equal(ctx.window.libraryScopeFilter,'all');
 assert(app.innerHTML.includes('Знайдено <strong>2</strong>'));
 ctx.window.librarySearch='some old exercise';
 await ctx.addLibraryExercise(2);
 assert(app.innerHTML.includes('Знайдено <strong>3</strong>'),'first new exercise displayed');
 assert(app.innerHTML.includes('Болгарські випади'));
 assert.equal(ctx.window.librarySearch,'');
 assert(!groupBody.classList.contains('hidden'),'created exercise group stays expanded');
 assert(!addBody.classList.contains('hidden'),'new exercise form stays expanded');
 assert(addBody.scrolled,'add form is brought back into view');
 inputs['#libName2'].value='Випади на місці';
 await ctx.addLibraryExercise(2);
 assert(app.innerHTML.includes('Знайдено <strong>4</strong>'),'second new exercise displayed');
 assert(app.innerHTML.includes('Випади на місці'));
 assert(!addBody.classList.contains('hidden'),'can immediately add a third exercise');
 console.log('Two sequential saves, stale filters, refresh, next add form PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
"""
        p=subprocess.run(["node","-e",js],cwd=ROOT,text=True,capture_output=True)
        self.assertEqual(p.returncode,0,p.stdout+"\n"+p.stderr)


if __name__=="__main__":
    unittest.main()
