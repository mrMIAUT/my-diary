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

    def test_goal_must_be_explicitly_selected(self):
        m,food,steps=inputs()
        for goal in ("",None,"lose_weight","auto"):
            with self.assertRaises(ValueError):
                analyze_four_week(TARGET,goal,m,food,[],steps,NOW)


if __name__=="__main__":
    unittest.main()
