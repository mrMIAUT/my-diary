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
PROGRESS_REDESIGN = (ROOT / "backend" / "static" / "js" / "progress-redesign.js").read_text(encoding="utf-8")
CALENDAR = (ROOT / "backend" / "static" / "js" / "calendar.js").read_text(encoding="utf-8")
TRAINING_REDESIGN = (ROOT / "backend" / "static" / "js" / "training-redesign.js").read_text(encoding="utf-8")
HOME = (ROOT / "backend" / "static" / "js" / "home-redesign.js").read_text(encoding="utf-8")
NUTRITION = (ROOT / "backend" / "static" / "js" / "nutrition-redesign.js").read_text(encoding="utf-8")
NUTRITION_JS = (ROOT / "backend" / "static" / "js" / "nutrition.js").read_text(encoding="utf-8")
MORE = (ROOT / "backend" / "static" / "js" / "more-redesign.js").read_text(encoding="utf-8")
LIBRARY = (ROOT / "backend" / "static" / "js" / "library.js").read_text(encoding="utf-8")
WORKOUT_LYFTA = (ROOT / "backend" / "static" / "js" / "workout-lyfta.js").read_text(encoding="utf-8")
TIMED_WORKOUT = (ROOT / "backend" / "static" / "js" / "timed-workout.js").read_text(encoding="utf-8")\nTIMER = (ROOT / "backend" / "static" / "js" / "timer.js").read_text(encoding="utf-8")
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

    def test_client_can_skip_planned_and_delete_added_sets(self):
        self.assertIn("CREATE TABLE IF NOT EXISTS workout_skipped_sets", APP)
        self.assertIn('"skipped_sets":"SELECT * FROM workout_skipped_sets', APP)
        self.assertIn("skipped_sets:List[int]", APP)
        self.assertIn("Підхід не може бути одночасно виконаний і пропущений", APP)
        self.assertIn("DELETE FROM workout_skipped_sets WHERE client_id=%s AND program_id=%s AND day=%s", APP)
        self.assertIn("function workoutSkippedSetNumbers", WORKOUT)
        self.assertIn("function toggleWorkoutPlannedSetSkipped", WORKOUT)
        self.assertIn("function removeWorkoutExtraSet(cid,pid,setNumber=0)", WORKOUT)
        self.assertIn("skipped_sets:skippedSets", WORKOUT)
        self.assertIn("function lyftaSetSwipeStart", WORKOUT_LYFTA)
        self.assertIn("data-set-action", WORKOUT_LYFTA)
        self.assertIn("Свайп вліво: пропустити плановий або видалити доданий підхід", WORKOUT_LYFTA)
        self.assertIn("skippedAll=(d.skipped_sets||[])", PROGRESS_REDESIGN)
        self.assertIn("Клієнт не виконував цей підхід", RESULTS)
        self.assertIn("d.skipped_sets=(d.skipped_sets||[])", CORE)

    def test_timed_exercises_extend_classic_workouts_additively(self):
        self.assertIn("ALTER TABLE program ADD COLUMN IF NOT EXISTS execution_mode", APP)
        self.assertIn("ALTER TABLE program ADD COLUMN IF NOT EXISTS work_seconds", APP)
        self.assertIn("CREATE TABLE IF NOT EXISTS timed_result_sets", APP)
        self.assertIn('"timed_result_sets":"SELECT * FROM timed_result_sets', APP)
        self.assertIn('@app.post("/api/timed-result-sets")', APP)
        self.assertIn("Ця вправа не входить до активного тренування", APP)
        self.assertIn("execution_mode,work_seconds,target_rir", APP)
        self.assertIn('id="executionmode"', PROGRAM)
        self.assertIn("Повтори</option><option value=\"time\">За часом", PROGRAM)
        self.assertIn("Робота, сек", PROGRAM)
        self.assertIn("program-reps-only", PROGRAM)
        self.assertIn("program-time-only hidden", PROGRAM)
        self.assertIn("function isTimedWorkoutExercise", TIMED_WORKOUT)
        self.assertIn("function timedWorkoutHistoryRows", TIMED_WORKOUT)
        self.assertIn("workoutHistoryNameKey", TIMED_WORKOUT)
        self.assertIn("requestAnimationFrame(timedExerciseFrame)", TIMED_WORKOUT)
        self.assertIn("function openTimedExerciseTimer", TIMED_WORKOUT)
        self.assertIn("function completedExerciseHTML", WORKOUT)
        self.assertIn("setRows(x,d,cid)", WORKOUT)
        self.assertIn("timed?timedExerciseHTML(effective,d,cid):completedExerciseHTML(effective,d,cid)", WORKOUT)
        self.assertIn("timed?timedWorkoutPlanText(x):repeatPlanText(x)", TRAINING_REDESIGN)
        self.assertIn("timed_result_sets", PROGRESS_REDESIGN)
        self.assertIn("progress-timed-label", PROGRESS_REDESIGN)
        self.assertIn("trainer-review-timed-exercise", RESULTS)
        self.assertIn("path==='/timed-result-sets'&&m==='POST'", CORE)
        self.assertIn("timed_result_sets", CORE)
        self.assertIn('/static/js/timed-workout.js?v=3', INDEX)
        self.assertIn("'/static/js/timed-workout.js?v=3'", SW)
        self.assertIn("data-timed-readonly", PROGRESS_REDESIGN)

    def test_trainer_nutrition_targets_auto_calculate_kcal_from_macros(self):
        self.assertIn("function syncTrainerNutritionTargetKcal", NUTRITION_JS)
        self.assertIn("Math.round(p*4+f*9+c*4)", NUTRITION_JS)
        self.assertIn('oninput="syncTrainerNutritionTargetKcal()"', NUTRITION_JS)
        self.assertIn("калорійність перерахується автоматично", NUTRITION_JS)

    def test_trainer_nutrition_targets_do_not_use_client_only_handler(self):
        self.assertIn("function saveTrainerNutritionTargets", NUTRITION_JS)
        self.assertIn("saveTrainerNutritionTargets(", NUTRITION_JS)
        self.assertIn("await api('/client/'+cid+'/nutrition'", NUTRITION_JS)
        self.assertNotIn("function saveNutritionTargets", NUTRITION_JS)
        self.assertIn("window.saveNutritionTargets", NUTRITION)

    def test_training_day_title_modal_uses_redesign_ui(self):
        self.assertIn("trainer-day-title-modal", PROGRAM)
        self.assertIn("trainer-day-title-card", PROGRAM)
        self.assertIn("trainer-day-title-save", PROGRAM)
        self.assertNotIn('style="width:100%;margin-top:14px"', PROGRAM)

    def test_review_completion_modal_uses_redesign_ui(self):
        self.assertIn("trainer-review-complete-modal", RESULTS)
        self.assertIn("trainer-review-complete-card", RESULTS)
        self.assertIn("trainer-review-complete-primary", RESULTS)
        self.assertIn("trainer-review-complete-secondary", RESULTS)
        self.assertNotIn('button style="width:100%" onclick="nextReviewModal.remove();openNextPendingClient', RESULTS)

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

    def test_timed_and_mixed_supersets_use_shared_round_logic(self):
        self.assertIn('id="ssexecutionmode"', PROGRAM)
        self.assertIn("function toggleSupersetExecutionFields", PROGRAM)
        self.assertIn("Відпочинок після суперсету, сек", PROGRAM)
        self.assertIn("Підходи / кола", PROGRAM)
        self.assertIn('source_mode=="time" or execution_mode=="time"', APP)
        self.assertIn("кількість підходів має бути однакова — це кількість кіл", APP)
        self.assertIn("function workoutSupersetPeers", WORKOUT)
        self.assertIn("function workoutSupersetIsLast", WORKOUT)
        self.assertIn("function focusSupersetNextExercise", WORKOUT)
        self.assertIn("function focusSupersetRoundStart", WORKOUT)
        self.assertIn("hasTimed=effectivePair.some(isTimedWorkoutExercise)", WORKOUT)
        self.assertIn("inSuperset&&!isLast", WORKOUT_LYFTA)
        self.assertIn("singleSet:inSuperset", TIMED_WORKOUT)
        self.assertIn("if(s.singleSet){await finishTimedExerciseTimer();return}", TIMED_WORKOUT)
        self.assertIn("startAutomaticRestTimer(sharedRest,false)", TIMED_WORKOUT)
        self.assertIn("без відпочинку до кінця кола", TIMED_WORKOUT)

    def test_superset_group_collapses_together_and_timed_rest_starts_before_refresh(self):
        self.assertIn("function toggleWorkoutSuperset", WORKOUT)
        self.assertIn("workout-live-superset-toggle", WORKOUT)
        self.assertIn("workout-live-superset-body hidden", WORKOUT)
        self.assertIn("workout-live-grouped-exercise-head", WORKOUT)
        self.assertIn("workout-live-grouped-body", WORKOUT)
        self.assertIn("focusWorkoutExerciseCard(nextPid)", WORKOUT)
        self.assertIn("if(singleSet&&isLast&&hasNextRound&&sharedRest>0)", TIMED_WORKOUT)
        finish_block = TIMED_WORKOUT.split("async function finishTimedExerciseTimer()",1)[1].split("function renderTimedExerciseTimer",1)[0]
        self.assertLess(finish_block.index("startAutomaticRestTimer(sharedRest,false)"), finish_block.index("loadClientData(cid)"))

    def test_timed_modal_cancel_keeps_timer_and_auto_rest_does_not_block(self):
        close_block = TIMED_WORKOUT.split("function closeTimedExerciseTimer(force)",1)[1].split("function openTimedExerciseTimer",1)[0]
        self.assertLess(close_block.index("confirm("), close_block.index("cancelAnimationFrame"))
        self.assertIn("return false", close_block)
        self.assertNotIn("if(e.target===modal)closeTimedExerciseTimer()", TIMED_WORKOUT)
        self.assertIn("function startAutomaticRestTimer", TIMER)
        auto_block = TIMER.split("function startAutomaticRestTimer",1)[1].split("function addRestTimer",1)[0]
        self.assertNotIn("ensureTimerNotifications", auto_block)
        self.assertNotIn("unlockTimerSound", auto_block)
        self.assertIn("startRestTimerCore", auto_block)
        self.assertIn("startAutomaticRestTimer(sharedRest,false)", TIMED_WORKOUT)

    def test_exercise_submit_actions_use_save_labels(self):
        self.assertIn(">Зберегти вправу</button>", PROGRAM)
        self.assertIn("save.textContent=show?'Зберегти суперсет':'Зберегти вправу'", PROGRAM)

    def test_repetition_count_mode_is_persisted_and_rendered(self):
        self.assertIn("ALTER TABLE program ADD COLUMN IF NOT EXISTS repeat_mode", APP)
        self.assertIn("ALTER TABLE result_sets ADD COLUMN IF NOT EXISTS repeat_mode", APP)
        self.assertIn("ALTER TABLE program_template_items ADD COLUMN IF NOT EXISTS repeat_mode", APP)
        self.assertIn("ALTER TABLE workout_aux_sets ADD COLUMN IF NOT EXISTS repeat_mode", APP)
        self.assertIn("def normalize_repeat_mode", APP)
        self.assertIn("REPEAT_MODE_OPTIONS", PROGRAM)
        self.assertIn("repeatPlanText", PROGRAM)
        self.assertIn("repeatResultText", PROGRAM)
        self.assertIn("repeatModeSelectHTML('repeatmode','normal')", PROGRAM)
        self.assertIn("repeatModeSelectHTML('ssInlineRepeatMode','normal')", PROGRAM)
        self.assertIn("repeat_mode:repeatMode", WORKOUT)
        self.assertIn("repeatModeShortLabel", WORKOUT_LYFTA)
        self.assertIn("repeat_mode:normalizeRepeatMode(item.repeat_mode)", TRAINER)
        self.assertIn("repeatResultText", RESULTS)
        self.assertIn("repeatResultText", PROGRESS_REDESIGN)
        self.assertIn("repeatResultText", CALENDAR)
        self.assertIn("repeat_mode:b.repeat_mode||'normal'", CORE)

    def test_superset_rest_is_rendered_once(self):
        self.assertIn("function supersetRestLabel", PROGRAM)
        self.assertIn("programExtraHTML(x,!isSuper)", PROGRAM)
        self.assertIn("redesignTrainingExerciseRow(y,xs.indexOf(y)+1,true,false)", TRAINING_REDESIGN)
        self.assertIn("card(y,true,false,true)", WORKOUT)

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

    def test_completed_workout_can_be_edited_and_reopened(self):
        self.assertIn('class CompletedWorkoutEditIn', APP)
        self.assertIn('@app.patch("/api/workout/{sid}/results")', APP)
        self.assertIn('@app.post("/api/workout/{sid}/reopen")', APP)
        self.assertIn("Скасувати завершення можна лише в день тренування", APP)
        self.assertIn("trainer_reviewed=FALSE,trainer_comment=''", APP)
        self.assertIn("function openCompletedWorkoutEditor", PROGRESS_REDESIGN)
        self.assertIn("function saveCompletedWorkoutEdit", PROGRESS_REDESIGN)
        self.assertIn("function reopenCompletedWorkout", PROGRESS_REDESIGN)
        self.assertIn("Редагувати тренування", PROGRESS_REDESIGN)
        self.assertIn("Скасувати завершення", PROGRESS_REDESIGN)
        self.assertIn("finish-summary-recovery-actions", WORKOUT)
        self.assertIn("(cancel|reopen|results)", CORE)
        self.assertIn("class CompletedWorkoutAuxSetIn", APP)
        self.assertIn("aux_sets:List[CompletedWorkoutAuxSetIn]", APP)
        self.assertIn("DELETE FROM workout_aux_sets WHERE client_id=%s AND day=%s", APP)
        self.assertIn("function completedWorkoutEditAuxRowHTML", PROGRESS_REDESIGN)
        self.assertIn("function addCompletedWorkoutDrop", PROGRESS_REDESIGN)
        self.assertIn("function addCompletedWorkoutWarmup", PROGRESS_REDESIGN)
        self.assertIn("aux_sets:auxSets", PROGRESS_REDESIGN)

    def test_extra_training_days_are_separate_from_main_cycle(self):
        self.assertIn("ALTER TABLE program_days ADD COLUMN IF NOT EXISTS kind", APP)
        self.assertIn("ALTER TABLE program_days ADD COLUMN IF NOT EXISTS extra_mode", APP)
        self.assertIn("ALTER TABLE program_days ADD COLUMN IF NOT EXISTS status", APP)
        self.assertIn("ALTER TABLE program_days ADD COLUMN IF NOT EXISTS active_until", APP)
        self.assertIn("ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS day_kind", APP)
        self.assertIn('@app.put("/api/program-day-settings")', APP)
        self.assertIn('@app.post("/api/program-day/duplicate")', APP)
        self.assertIn('@app.delete("/api/program-day/{cid}")', APP)
        self.assertIn("Додаткове тренування призупинено тренером", APP)
        self.assertIn("meta.get(\"extra_mode\")==\"once\"", APP)
        self.assertIn("SET status='paused'", APP)
        self.assertIn("COALESCE(day_kind,'standard')='standard'", APP)
        self.assertIn("function programDayIsExtra", PROGRAM)
        self.assertIn("function openExtraTrainingDayModal", PROGRAM)
        self.assertIn("function toggleExtraTrainingDayStatus", PROGRAM)
        self.assertIn("function promoteExtraTrainingDay", PROGRAM)
        self.assertIn("function duplicateProgramDay", PROGRAM)
        self.assertIn("function deleteProgramDay", PROGRAM)
        self.assertIn("function trainerExtraTrainingPanelHTML", PROGRAM)
        self.assertIn("function trainerExtraProgramDayCardHTML", PROGRAM)
        self.assertIn("standardEntries=Object.entries(groups).filter(([day])=>!programDayIsExtra(d,day))", PROGRAM)
        self.assertIn("Додаткові тренування", PROGRAM)
        self.assertIn("Разові або тимчасові дні поза основним циклом", PROGRAM)
        self.assertIn("pane.querySelectorAll('[data-program-day]')", PROGRAM)
        self.assertIn("!programDayIsExtra(d,day)", WORKOUT)
        self.assertIn("String(x.day_kind||'standard')!=='extra'", WORKOUT)
        self.assertIn("redesign-extra-training-section", TRAINING_REDESIGN)
        self.assertIn("redesignExtraTrainingDayCard", TRAINING_REDESIGN)
        self.assertIn("Не впливають на основний цикл", TRAINING_REDESIGN)
        self.assertIn("!programDayIsExtra(d,day)", HOME)
        self.assertIn("day_kind:dayKind", CORE)

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
