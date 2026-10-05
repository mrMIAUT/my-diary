import ast
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = (ROOT / "backend" / "app.py").read_text(encoding="utf-8")
CORE = (ROOT / "backend" / "static" / "js" / "core.js").read_text(encoding="utf-8")
TRAINER = (ROOT / "backend" / "static" / "js" / "trainer.js").read_text(encoding="utf-8")
PROGRAM = (ROOT / "backend" / "static" / "js" / "program.js").read_text(encoding="utf-8")
WORKOUT = (ROOT / "backend" / "static" / "js" / "workout.js").read_text(encoding="utf-8")
RESULTS = (ROOT / "backend" / "static" / "js" / "results.js").read_text(encoding="utf-8")
TRAINING_REDESIGN = (ROOT / "backend" / "static" / "js" / "training-redesign.js").read_text(encoding="utf-8")
HOME = (ROOT / "backend" / "static" / "js" / "home-redesign.js").read_text(encoding="utf-8")
NUTRITION = (ROOT / "backend" / "static" / "js" / "nutrition-redesign.js").read_text(encoding="utf-8")
MORE = (ROOT / "backend" / "static" / "js" / "more-redesign.js").read_text(encoding="utf-8")
LIBRARY = (ROOT / "backend" / "static" / "js" / "library.js").read_text(encoding="utf-8")
WORKOUT_LYFTA = (ROOT / "backend" / "static" / "js" / "workout-lyfta.js").read_text(encoding="utf-8")
INDEX = (ROOT / "backend" / "static" / "index.html").read_text(encoding="utf-8")
SW = (ROOT / "backend" / "static" / "sw.js").read_text(encoding="utf-8")


def literal_assignment(source: str, name: str):
    tree = ast.parse(source)
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == name:
                    return ast.literal_eval(node.value)
    raise AssertionError(f"{name} assignment not found")


class ReleaseContracts(unittest.TestCase):
    def test_api_routes_are_unique(self):
        routes = re.findall(
            r'@app\.(get|post|put|patch|delete|api_route)\("([^"]+)"',
            APP,
        )
        duplicates = sorted({route for route in routes if routes.count(route) > 1})
        self.assertEqual(duplicates, [], f"duplicate API routes: {duplicates}")

    def test_tariff_matrix(self):
        plans = literal_assignment(APP, "PLAN_FEATURES")
        self.assertEqual(
            plans["coaching"],
            {
                "workouts": True,
                "nutrition": True,
                "measurements": True,
                "cardio": True,
                "trainer_review": True,
                "meal_plan": True,
                "checkin": True,
            },
        )
        self.assertEqual(
            plans["workout_plan"],
            {
                "workouts": True,
                "nutrition": True,
                "measurements": True,
                "cardio": True,
                "trainer_review": False,
                "meal_plan": False,
                "checkin": False,
            },
        )
        self.assertEqual(
            plans["workout_nutrition"],
            {
                "workouts": True,
                "nutrition": True,
                "measurements": True,
                "cardio": True,
                "trainer_review": False,
                "meal_plan": True,
                "checkin": False,
            },
        )
        self.assertEqual(
            plans["self"],
            {
                "workouts": True,
                "nutrition": True,
                "measurements": True,
                "cardio": True,
                "trainer_review": False,
                "meal_plan": False,
                "checkin": False,
            },
        )
        self.assertTrue(all(value is False for value in plans["free"].values()))

    def test_coaching_only_mutations_are_server_gated(self):
        self.assertIn("require_active_client(cid,'checkin')", APP)
        self.assertIn("require_active_client(s[\"client_id\"],'trainer_review')", APP)
        self.assertIn("require_active_client(x.client_id,'trainer_review')", APP)
        self.assertIn("require_active_client(rec[\"client_id\"],'nutrition')", APP)
        self.assertIn("require_active_client(cid,'meal_plan')", APP)

    def test_access_downgrade_preserves_manual_status_and_closes_live_workout(self):
        block = APP.split('@app.patch("/api/clients/{cid}/access")', 1)[1].split('return {"ok":True,"access":access}', 1)[0]
        self.assertNotIn("status=CASE WHEN", block)
        self.assertNotIn("status='Активний'", block)
        self.assertIn("FOR UPDATE", block)
        self.assertIn('if not access["features"].get("workouts",False):', block)
        self.assertIn("status='training'", block)

    def test_review_side_effects_are_coaching_only(self):
        self.assertIn("require_active_client(rec[\"client_id\"],'trainer_review')", APP)
        self.assertIn('if access["features"].get("trainer_review",False):', APP)
        self.assertIn('kind in {"workout_finished","cardio","comment"}', APP)

    def test_frontend_respects_tariff_contract(self):
        self.assertIn("features.workouts?item('training'", CORE)
        self.assertIn("item('nutrition','Харчування','food'", CORE)
        self.assertNotIn("features.nutrition?item('nutrition'", CORE)
        self.assertIn("Персональний план харчування", NUTRITION)
        self.assertIn("Переглянути тренерів", NUTRITION)
        self.assertIn("checkinEnabled=!!features.checkin", HOME)
        self.assertIn("nutritionEnabled=!!features.nutrition", HOME)
        self.assertIn("features?.meal_plan", NUTRITION)
        self.assertIn("openNutritionTargetsModal", NUTRITION)
        self.assertIn("ЄПЛАН Самостійно", TRAINER)
        self.assertIn("redesignHomeTrainersHTML", HOME)
        self.assertIn("trainer-card-v3", HOME)
        self.assertIn("trainer-card-v3", MORE)
        self.assertIn("Профіль ›", HOME)
        self.assertIn("Профіль ›", MORE)
        self.assertIn("api('/trainers')", HOME)
        measurements = (ROOT / "backend" / "static" / "js" / "measurements.js").read_text(encoding="utf-8")
        trainer = (ROOT / "backend" / "static" / "js" / "trainer.js").read_text(encoding="utf-8")
        self.assertIn("hasFeature('measurements'", measurements)
        self.assertIn("isoAddMonthsFrom", trainer)
        self.assertIn("trainerAccessIsActive", trainer)

    def test_trainer_profile_upsert_uses_trainer_id_safe_transaction(self):
        block = APP.split('@app.patch("/api/trainer/profile")', 1)[1].split('@app.post("/api/trainer/profile/avatar")', 1)[0]
        self.assertIn("with con() as db:", block)
        self.assertIn("ON CONFLICT(trainer_id)", block)
        self.assertNotIn('run("""INSERT INTO trainer_profiles', block)
        sql_block = block.split('db.execute("""', 1)[1].split('""",', 1)[0]
        self.assertNotIn("RETURNING id", sql_block)

    def test_trainer_marketplace_foundation(self):
        self.assertIn("CREATE TABLE IF NOT EXISTS trainer_profiles", APP)
        self.assertIn("CREATE TABLE IF NOT EXISTS trainer_requests", APP)
        self.assertIn("CREATE TABLE IF NOT EXISTS trainer_client_history", APP)
        self.assertIn("CREATE TABLE IF NOT EXISTS trainer_reviews", APP)
        self.assertIn("CREATE TABLE IF NOT EXISTS program_templates", APP)
        self.assertIn("CREATE TABLE IF NOT EXISTS program_template_items", APP)
        self.assertIn('@app.get("/api/trainers")', APP)
        self.assertIn('@app.get("/api/trainer/profile")', APP)
        self.assertIn('@app.post("/api/trainer/profile/avatar")', APP)
        self.assertIn('@app.put("/api/trainers/{trainer_id}/review")', APP)
        self.assertIn('@app.post("/api/trainers/{trainer_id}/request")', APP)
        self.assertIn('@app.get("/api/trainer/program-templates")', APP)
        self.assertIn('@app.post("/api/trainer/program-templates/{template_id}/apply")', APP)
        self.assertIn('"trainer_id"', APP)
        self.assertIn("active_clients", APP)
        self.assertIn("rating_avg", APP)
        self.assertIn('@app.patch("/api/client/{cid}/nutrition-targets")', APP)
        self.assertIn('if access["features"].get("meal_plan",False):', APP)
        self.assertIn("showClientTrainers", MORE)
        self.assertIn("showClientTrainerProfile", MORE)
        self.assertIn("openTrainerReviewModal", MORE)
        self.assertIn("showTrainerPublicProfileEditor", TRAINER)
        self.assertIn("showTrainerCoachRequests", TRAINER)
        self.assertIn("openCreateProgramTemplateModal", TRAINER)
        self.assertIn("applyProgramTemplate", TRAINER)
        self.assertIn("openTrainerAvatarCropper", TRAINER)
        self.assertIn("saveTrainerAvatarCrop", TRAINER)
        self.assertIn("trainerProfileCompactHTML", TRAINER)
        self.assertIn("showTrainerPublicProfileEditor(false)", TRAINER)
        self.assertIn("Редагувати профіль", TRAINER)
        self.assertIn("canvas.toBlob", TRAINER)
        self.assertIn("canvas.width=512", TRAINER)
        self.assertNotIn("file.size>10*1024*1024", TRAINER)
        self.assertIn("CREATE TABLE IF NOT EXISTS trainer_profile_media", APP)
        self.assertIn("avatar_data BYTEA", APP)
        avatar_block = APP.split('@app.post("/api/trainer/profile/avatar")', 1)[1].split('@app.get("/api/trainers/{trainer_id}/reviews")', 1)[0]
        self.assertIn("INSERT INTO trainer_profile_media", avatar_block)
        self.assertIn("SELECT avatar_data,avatar_media_type", avatar_block)
        self.assertNotIn("os.open(target", avatar_block)

    def test_exercise_library_has_platform_and_trainer_scopes(self):
        self.assertIn("owner_trainer_id", APP)
        self.assertIn("visibility", APP)
        self.assertIn("ux_exercise_library_platform_name", APP)
        self.assertIn("ux_exercise_library_trainer_name", APP)
        self.assertIn('exercise["scope"]="platform"', APP)
        self.assertIn("Моя вправа", LIBRARY)
        self.assertIn("trainer-library-filter-strip", LIBRARY)
        self.assertIn("trainer-library-filter-chip", LIBRARY)
        self.assertIn("opacity:0!important", LIBRARY)
        self.assertIn("position:absolute!important", LIBRARY)
        self.assertIn("Бібліотека", LIBRARY)
        self.assertIn("Мої вправи", LIBRARY)


    def test_no_unfinished_program_template_placeholder(self):
        self.assertNotIn("Конструктор шаблонів програм додамо наступним етапом", TRAINER)
        self.assertNotIn("trainerProgramsTab", TRAINER)
        self.assertIn('@app.put("/api/trainer/program-templates/{template_id}")', APP)
        self.assertIn('@app.post("/api/trainer/program-templates/{template_id}/copy")', APP)
        self.assertIn("openEditProgramTemplate", TRAINER)
        self.assertIn("saveProgramTemplateChanges", TRAINER)
        self.assertIn("saveProgramTemplateAsNew", TRAINER)

    def test_progression_hint_uses_reps_and_rir(self):
        self.assertIn("lyftaShouldSuggestProgression", WORKOUT_LYFTA)
        self.assertIn("Можна трохи збільшити вагу", WORKOUT_LYFTA)
        self.assertIn("(+p.reps||0)<upper", WORKOUT_LYFTA)
        self.assertIn("(+p.rir||0)<+target", WORKOUT_LYFTA)

    def test_optional_warmup_and_drop_sets(self):
        self.assertIn("CREATE TABLE IF NOT EXISTS workout_aux_sets", APP)
        self.assertIn('"aux_sets":"SELECT * FROM workout_aux_sets', APP)
        self.assertIn("WorkoutAuxSetIn", APP)
        self.assertIn("kind not in (\"warmup\",\"drop\")", APP)
        self.assertIn("lyftaWarmupRowsHTML", WORKOUT_LYFTA)
        self.assertIn("lyftaDropRowsHTML", WORKOUT_LYFTA)
        self.assertIn("Додати розминочні підходи", WORKOUT_LYFTA)
        self.assertIn("Додати дроп-сет", WORKOUT_LYFTA)
        self.assertIn("collectWorkoutAuxSets", WORKOUT)

    def test_training_day_title_modal_uses_redesign_ui(self):
        self.assertIn("trainer-day-title-modal", PROGRAM)
        self.assertIn("trainer-day-title-card", PROGRAM)
        self.assertIn("trainer-day-title-save", PROGRAM)
        self.assertNotIn('style="width:100%;margin-top:14px"', PROGRAM)

    def test_delete_exercise_stays_on_program_tab(self):
        self.assertIn("async function deleteExercise", PROGRAM)
        self.assertIn("pane.innerHTML=trainerTrainingTabHTML(fresh)", PROGRAM)
        self.assertIn("reopenTrainerProgramDay(dayName)", PROGRAM)
        self.assertNotIn("openClient(selected)}}", PROGRAM)

    def test_alternative_exercises_have_independent_parameters(self):
        self.assertIn("normalize_program_alternatives", APP)
        self.assertIn("selected_cfg[\"sets\"]", APP)
        self.assertIn("selected_cfg[\"rir_by_set\"]", APP)
        self.assertIn("function exerciseAlternativeConfigs", PROGRAM)
        self.assertIn("trainer-program-alternative-params", PROGRAM)
        self.assertIn("collectProgramAlternatives", PROGRAM)
        self.assertIn("function workoutEffectiveExercise", WORKOUT)
        self.assertIn("workoutChoiceSummary", WORKOUT)
        self.assertIn("updateProgramTemplateAlternativeField", TRAINER)

    def test_review_link_switches_to_training_tab(self):
        self.assertIn("function focusTrainerPendingSession", RESULTS)
        self.assertIn("showTrainerClientTab('program',programBtn,false)", RESULTS)
        self.assertIn('trainerPendingReviewQueue .trainer-review-card[data-session="', RESULTS)

    def test_program_superset_creation_and_append_order(self):
        self.assertIn("superset_with_id:int=Field(default=0,ge=0)", APP)
        self.assertIn("COALESCE(MAX(sort),0)+1 AS n", APP)
        self.assertIn("superset_group=f\"SS{source['id']}\"", APP)
        self.assertIn("ProgramSupersetPairIn", APP)
        self.assertIn('@app.post("/api/program/superset-pair")', APP)
        self.assertIn("toggleNewExerciseSupersetBuilder", PROGRAM)
        self.assertIn("programSupersetAlternativesEditor", PROGRAM)
        self.assertIn("api('/program/superset-pair'", PROGRAM)
        self.assertNotIn("refreshNewExerciseSupersetOptions", PROGRAM)
        self.assertNotIn('id="supersetwith"', PROGRAM)
        self.assertIn("superset_with_id:sourceId", PROGRAM)

    def test_exercise_submit_actions_use_save_labels(self):
        self.assertIn(">Зберегти вправу</button>", PROGRAM)
        self.assertIn("save.textContent=show?'Зберегти суперсет':'Зберегти вправу'", PROGRAM)

    def test_superset_rest_is_rendered_once(self):
        self.assertIn("function supersetRestLabel", PROGRAM)
        self.assertIn("programExtraHTML(x,!isSuper)", PROGRAM)
        self.assertIn("redesignTrainingExerciseRow(y,xs.indexOf(y)+1,true,false)", TRAINING_REDESIGN)
        self.assertIn("card(y,true,false)", WORKOUT)

    def test_alternative_technique_uses_clean_top_row(self):
        self.assertIn("alternative-chip-top", PROGRAM)
        self.assertNotIn("alternative-divider", PROGRAM.split("function alternativesTrainerHTML",1)[1].split("function orderedSupersetItems",1)[0])

    def test_completed_badge_and_template_alternatives_ui(self):
        self.assertIn("workout-live-toggle-side", WORKOUT)
        self.assertIn("exercise-done-badge compact", WORKOUT)
        self.assertIn("programTemplateAlternativesEditorHTML", TRAINER)
        self.assertIn("addProgramTemplateAlternative", TRAINER)
        self.assertIn("openProgramExercisePicker", TRAINER)
        self.assertIn("trainer-program-exercise-field trainer-template-editor-exercise", TRAINER)
        self.assertIn("trainer-program-alternative-row trainer-template-alternative-row", TRAINER)
        self.assertIn("Обрати з бібліотеки", TRAINER)
        self.assertNotIn("Вправа 1; Вправа 2", TRAINER)

    def test_index_shell_assets_exist_and_are_cached(self):
        urls = re.findall(r'(?:src|href)="(/(?:static/[^"]+|manifest\.webmanifest[^"]*))"', INDEX)
        shell_urls = [u for u in urls if u.endswith(".js") or ".js?" in u or u.endswith(".css") or ".css?" in u or "manifest.webmanifest" in u]
        self.assertTrue(shell_urls, "no app shell assets found in index.html")
        for url in shell_urls:
            path = url.split("?", 1)[0].lstrip("/")
            disk_path = ROOT / "backend" / ("static/manifest.webmanifest" if path == "manifest.webmanifest" else path)
            self.assertTrue(disk_path.exists(), f"missing asset: {path}")
            self.assertIn(repr(url), SW, f"service worker cache is missing {url}")


if __name__ == "__main__":
    unittest.main()
