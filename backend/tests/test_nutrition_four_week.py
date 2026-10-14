import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from nutrition_four_week import analyze_four_week

NOW=date(2026,10,15)
START=NOW-timedelta(days=27)
TARGET={"kcal":2200,"protein":160,"fat":80,"carbs":210}

def day(n):
    return (START+timedelta(days=n)).isoformat()

def inputs(weight_values=(80,80,80,80),waists=(85,85),logged_days=range(28),
           steps_before=8000,steps_after=8000):
    measure=[{"day":day(n),"weight":weight_values[i]} for i,n in enumerate((0,7,14,21))]
    measure.extend(({"day":day(0),"waist":waists[0]},
                    {"day":day(27),"waist":waists[1]}))
    # Date 27 is also a fourth-week weight measurement in real use.
    nutrition=[{"day":day(i),"kcal":2200} for i in logged_days]
    steps=[{"day":day(i),"steps":steps_before if i<14 else steps_after} for i in range(28)]
    return measure,nutrition,steps


class FourWeekNutritionTest(unittest.TestCase):
    def review(self,goal="loss",measure=None,manual=None,diary=None,steps=None):
        default_m,default_food,default_steps=inputs()
        return analyze_four_week(TARGET,goal,default_m if measure is None else measure,
                                 default_food if manual is None else manual,
                                 [] if diary is None else diary,
                                 default_steps if steps is None else steps,NOW)

    def test_loss_plateau_proposes_only_carb_reduction_and_no_write(self):
        result=self.review()
        self.assertEqual(result["status"],"suggested")
        self.assertEqual(result["recommended"],{"kcal":2080,"protein":160,"fat":80,"carbs":180})
        self.assertEqual(TARGET["kcal"],2200)
        self.assertEqual(result["weight"]["weekly_counts"],[1,1,1,1])
        self.assertEqual(result["nutrition"]["days"],28)

    def test_gain_plateau_proposes_bounded_increase(self):
        result=self.review("gain")
        self.assertEqual(result["status"],"suggested")
        self.assertEqual(result["recommended"]["kcal"],2320)
        self.assertEqual(result["recommended"]["protein"],TARGET["protein"])

    def test_waist_progress_prevents_cut_with_stable_weight(self):
        measures,food,steps=inputs(waists=(85,84))
        result=self.review(measure=measures,manual=food,steps=steps)
        self.assertEqual(result["status"],"hold")
        self.assertIsNone(result["recommended"])

    def test_weight_progress_prevents_cut(self):
        m,food,steps=inputs(weight_values=(80,80,79,79))
        result=self.review(measure=m,manual=food,steps=steps)
        self.assertEqual(result["status"],"hold")

    def test_gain_and_waist_growth_prevents_surplus(self):
        m,food,steps=inputs(waists=(85,87))
        result=self.review("gain",measure=m,manual=food,steps=steps)
        self.assertEqual(result["status"],"hold")

    def test_no_auto_recommendation_for_recomp_or_maintenance(self):
        for goal in ("recomp","maintain"):
            self.assertEqual(self.review(goal)["status"],"hold")

    def test_insufficient_weighins_not_enough(self):
        m,_,_=inputs()
        m=[row for row in m if not row.get("weight") or row["day"] in (day(0),day(14))]
        result=self.review(measure=m)
        self.assertEqual(result["status"],"insufficient")
        self.assertIsNone(result["recommended"])

    def test_no_waist_samples_blocks_change(self):
        m,_,_=inputs()
        result=self.review(measure=[row for row in m if "waist" not in row])
        self.assertEqual(result["status"],"insufficient")

    def test_food_less_than_14_days_is_insufficient(self):
        _,food,_=inputs(logged_days=range(10))
        self.assertEqual(self.review(manual=food)["status"],"insufficient")

    def test_eating_far_below_target_not_a_new_cut(self):
        _,food,_=inputs()
        for row in food:row["kcal"]=1600
        self.assertEqual(self.review(manual=food)["status"],"insufficient")

    def test_activity_changed_requires_human_review(self):
        _,_,steps=inputs(steps_after=4000)
        self.assertEqual(self.review(steps=steps)["status"],"insufficient")

    def test_manual_and_diary_same_day_are_not_summed(self):
        m,food,steps=inputs()
        diary=[{"day":day(i),"kcal":2200} for i in range(14)]
        result=self.review(measure=m,manual=food,diary=diary,steps=steps)
        self.assertEqual(result["nutrition"]["days"],28)
        self.assertEqual(result["nutrition"]["average_kcal"],2200)
        self.assertTrue(any("подвійного" in msg for msg in result["warnings"]))

    def test_future_or_bad_dates_and_invalid_measurements_skipped(self):
        m,food,steps=inputs()
        m.append({"day":day(60),"weight":200,"waist":150})
        m.append({"day":"not-a-date","weight":200,"waist":200})
        m.append({"day":day(9),"weight":float("nan"),"waist":-10})
        report=self.review(measure=m,manual=food,steps=steps)
        self.assertEqual(report["weight"]["entries"],4)
        self.assertEqual(report["waist"]["entries"],2)

    def test_bad_target_macro_mismatch_needs_fix(self):
        bad=dict(TARGET,kcal=1500)
        m,food,steps=inputs()
        result=analyze_four_week(bad,"loss",m,food,[],steps,NOW)
        self.assertEqual(result["status"],"insufficient")

    def test_exactly_one_weight_per_week_is_sufficient(self):
        result=self.review()
        self.assertEqual(result["status"],"suggested")
        self.assertEqual([w["weight"] for w in result["weight"]["weeks"]],[80,80,80,80])
        self.assertEqual([w["entries"] for w in result["weight"]["weeks"]],[1,1,1,1])
        self.assertEqual(result["weight"]["method"],"weekly_latest")
        self.assertEqual(result["waist"]["method"],"week1_to_week4")

    def test_latest_weight_per_week_is_used_not_daily_averaging(self):
        m,food,steps=inputs()
        m.extend(({"day":day(1),"weight":95},{"day":day(6),"weight":79.5},
                  {"day":day(15),"weight":72.0},{"day":day(27),"weight":79.0}))
        result=self.review(measure=m,manual=food,steps=steps)
        self.assertEqual(result["weight"]["weekly_counts"],[3,1,2,2])
        self.assertEqual([w["weight"] for w in result["weight"]["weeks"]],[79.5,80,72,79])
        self.assertEqual(result["weight"]["first"],79.5)
        self.assertEqual(result["weight"]["last"],79)
        self.assertEqual(result["status"],"hold")  # Improvement week 1 to 4

    def test_waist_only_middle_weeks_not_valid_four_week_change(self):
        m,food,steps=inputs()
        m=[row for row in m if "waist" not in row]
        m.extend(({"day":day(7),"waist":85},{"day":day(14),"waist":84}))
        result=self.review(measure=m,manual=food,steps=steps)
        self.assertEqual(result["status"],"insufficient")
        self.assertEqual(result["waist"]["first"],None)
        self.assertEqual(result["waist"]["last"],None)

    def test_first_and_fourth_week_waist_are_used_not_half_averages(self):
        m,food,steps=inputs(waists=(86,85))
        m.extend(({"day":day(10),"waist":99},{"day":day(15),"waist":55},
                  {"day":day(2),"waist":84},{"day":day(22),"waist":84.5}))
        result=self.review(measure=m,manual=food,steps=steps)
        self.assertEqual(result["waist"]["first"],86)
        self.assertEqual(result["waist"]["last"],85)
        self.assertEqual(result["status"],"hold")

    def test_start_date_preserves_baseline_beyond_rolling_window(self):
        m,food,steps=inputs()
        report=analyze_four_week(TARGET,"loss",m,food,[],steps,
                                 NOW+timedelta(days=2),START)
        self.assertEqual(report["period_start"],START.isoformat())
        self.assertEqual(report["period_end"],NOW.isoformat())
        self.assertEqual(report["weight"]["entries"],4)
        self.assertEqual(report["status"],"suggested")

    def test_no_adjustment_while_four_weeks_in_progress(self):
        m,food,steps=inputs()
        report=analyze_four_week(TARGET,"loss",m,food,[],steps,
                                 START+timedelta(days=21),START)
        self.assertEqual(report["status"],"in_progress")
        self.assertIsNone(report["recommended"])
        self.assertFalse(report["complete"])
        self.assertEqual(report["period_end"],NOW.isoformat())
        self.assertTrue(any("залишилося" in msg for msg in report["reasons"]))

    def test_circumference_is_optional_context_without_changing_waist_logic(self):
        m,food,steps=inputs()
        m.extend(({"day":day(0),"chest":96,"hips":99},
                  {"day":day(27),"chest":95,"hips":98}))
        result=self.review(measure=m,manual=food,steps=steps)
        self.assertEqual(result["circumferences"]["chest"]["delta"],-1)
        self.assertEqual(result["circumferences"]["hips"]["delta"],-1)
        self.assertEqual(result["status"],"suggested")

    def test_start_date_rejects_future_or_older_than_year(self):
        m,food,steps=inputs()
        for invalid in (NOW+timedelta(days=1),NOW-timedelta(days=366)):
            with self.assertRaises(ValueError):
                analyze_four_week(TARGET,"loss",m,food,[],steps,NOW,invalid)

    def test_goal_must_be_explicitly_selected(self):
        m,food,steps=inputs()
        for goal in ("",None,"lose_weight","auto"):
            with self.assertRaises(ValueError):
                analyze_four_week(TARGET,goal,m,food,[],steps,NOW)


if __name__=="__main__":
    unittest.main()
