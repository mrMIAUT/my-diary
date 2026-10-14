"""Conservative, read-only 28-day nutrition review for a trainer.

Use one weekly weigh-in/check-in in each of four consecutive 7-day
windows. Compare week 1 with week 4; waist circumferences compare only
the first and fourth weeks. Daily weighing is never required. This module never writes goals or meal plans. It only
offers a bounded draft for manual trainer approval.
"""
from datetime import date, timedelta
from statistics import mean
import math

VALID_GOALS = frozenset(("loss", "gain", "recomp", "maintain"))


def _day(value):
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None


def _finite(value, lower, upper):
    try:
        number = float(value)
        if math.isfinite(number) and lower <= number <= upper:
            return number
    except (TypeError, ValueError, OverflowError):
        pass
    return None


def _series(records, key, start, today, low, high):
    """One measurement per date, most recently written duplicate wins."""
    values = {}
    for row in records:
        when = _day(row.get("day"))
        number = _finite(row.get(key), low, high)
        if when is not None and start <= when <= today and number is not None:
            values[when] = number
    return values


def _round(value, places=1):
    return round(value, places) if value is not None else None


def analyze_four_week(target, goal, measurements, manual_food, diary_food,
                      activity, today, start_date=None):
    if goal not in VALID_GOALS:
        raise ValueError("Trainer must explicitly select a valid goal")
    last = _day(today)
    if last is None:
        raise ValueError("Invalid review date")
    start = _day(start_date) if start_date is not None else last-timedelta(days=27)
    if start is None or start > last or start < last-timedelta(days=365):
        raise ValueError("Review start must be within the last 365 days")
    planned_end = start+timedelta(days=27)
    complete = planned_end <= last
    last = min(last, planned_end)
    middle = start+timedelta(days=14)
    warnings = []
    reasons = []
    kcal = int(_finite(target.get("kcal"), 0, 7000) or 0)
    protein = int(_finite(target.get("protein"), 0, 1000) or 0)
    fat = int(_finite(target.get("fat"), 0, 1000) or 0)
    carbs = int(_finite(target.get("carbs"), 0, 1000) or 0)
    goal_energy = protein*4 + fat*9 + carbs*4

    weights = _series(measurements, "weight", start, last, 30, 350)
    waists = _series(measurements, "waist", start, last, 35, 230)
    # Each of the 4 nonoverlapping 7-day windows needs ONE weigh-in, not
    # daily measurements. When multiple measurements exist in the same week,
    # treat the latest one as that week's check-in (not an extra data point).
    weeks = []
    weekly_counts = []
    for week in range(4):
        week_start = start + timedelta(days=7*week)
        week_end = week_start + timedelta(days=7)
        subset = [(when, value) for when, value in weights.items()
                  if week_start <= when < week_end]
        weekly_counts.append(len(subset))
        selected = max(subset, key=lambda pair: pair[0]) if subset else None
        weeks.append({
            "week": week + 1,
            "start": week_start.isoformat(),
            "end": (week_end-timedelta(days=1)).isoformat(),
            "day": selected[0].isoformat() if selected else None,
            "weight": _round(selected[1], 2) if selected else None,
            "entries": len(subset),
        })
    weight_first = weeks[0]["weight"]
    weight_last = weeks[3]["weight"]
    weight_delta = weight_last - weight_first if weight_first is not None and weight_last is not None else None
    weight_pct = weight_delta / weight_first * 100 if weight_delta is not None and weight_first else None

    # Circumferences are assessed over the whole 4-week interval:
    # the earliest entry during week 1 and latest entry during week 4.
    # A measurement made only in week 2 or 3 cannot pass the review gate.
    first_week_waists = [(when, value) for when, value in waists.items()
                         if start <= when < start+timedelta(days=7)]
    fourth_week_waists = [(when, value) for when, value in waists.items()
                          if start+timedelta(days=21) <= when <= last]
    waist_first = min(first_week_waists, key=lambda p: p[0])[1] if first_week_waists else None
    waist_last = max(fourth_week_waists, key=lambda p: p[0])[1] if fourth_week_waists else None
    waist_delta = waist_last - waist_first if waist_first is not None and waist_last is not None else None

    if any(not count for count in weekly_counts):
        reasons.append("Потрібен один запис ваги за кожен із 4 тижнів. Щоденне зважування не потрібне.")
    if waist_first is None or waist_last is None:
        reasons.append("Для корекції потрібні заміри талії на 1-му і 4-му тижнях.")
    # The four-week span is relative to the trainer-selected start date,
    # never to whichever calendar date happened to be 'today' at review.
    if not complete:
        remaining=(planned_end-last).days
        reasons.insert(0,f"До завершення 28-денного періоду залишилося {remaining} дн. Корекція поки недоступна.")

    # Legacy daily manual BJU and the newer food diary are alternative
    # logging methods, not calories to be added together.
    manual = _series(manual_food, "kcal", start, last, 1, 7000)
    diary = _series(diary_food, "kcal", start, last, 1, 7000)
    overlapping = set(manual) & set(diary)
    if overlapping:
        warnings.append("У дні з двома способами обліку взято щоденник продуктів, без подвійного підрахунку.")
    logged = {**manual, **diary}
    food_early = [v for d, v in logged.items() if d < middle]
    food_late = [v for d, v in logged.items() if d >= middle]
    food_mean = mean(logged.values()) if logged else None
    if len(logged) < 14 or len(food_early) < 6 or len(food_late) < 6:
        reasons.append("Потрібно щонайменше 14 днів записів харчування, по 6 у кожній половині періоду.")
    if kcal < 1200 or protein < 1 or fat < 1 or carbs < 1:
        reasons.append("Тренер має спочатку встановити коректну ціль КБЖУ.")
    elif abs(goal_energy-kcal) > 50:
        reasons.append("Поточні калорії не узгоджуються з БЖВ; перевір ціль перед корекцією.")
    if kcal and food_mean is not None and abs(food_mean/kcal-1) > .10:
        reasons.append("Середній записаний калораж відрізняється від цілі більше ніж на 10%; спочатку перевір дотримання плану.")

    steps = _series(activity, "steps", start, last, 1, 100000)
    steps_early = [v for d, v in steps.items() if d < middle]
    steps_late = [v for d, v in steps.items() if d >= middle]
    steps_before = mean(steps_early) if steps_early else None
    steps_after = mean(steps_late) if steps_late else None
    if len(steps_early) < 4 or len(steps_late) < 4:
        warnings.append("Недостатньо записів кроків для порівняння активності; тренер має перевірити її вручну.")
    elif steps_before and abs(steps_after/steps_before-1) > .25:
        reasons.append("Кількість кроків змінилася більш ніж на 25%; спочатку оцінюй зміну активності.")

    # Contextual circumferences supplement waist, without being converted into
    # pseudo-weight or triggering an independent calorie adjustment.
    circumferences = {}
    for key, label in (("chest","Груди"),("hips","Стегна"),
                       ("shoulders","Плечі"),("arms","Руки"),
                       ("thighs","Стегна (верхня частина)"),("calves","Гомілки")):
        series=_series(measurements,key,start,last,15,250)
        before=[(when,value) for when,value in series.items()
                if start<=when<start+timedelta(days=7)]
        after=[(when,value) for when,value in series.items()
               if start+timedelta(days=21)<=when<=last]
        initial=min(before,key=lambda pair:pair[0])[1] if before else None
        final=max(after,key=lambda pair:pair[0])[1] if after else None
        circumferences[key]={"label":label,"first":_round(initial),
                             "last":_round(final),
                             "delta":_round(final-initial) if initial is not None and final is not None else None}

    report = {
        "period_start": start.isoformat(), "period_end": planned_end.isoformat(),
        "as_of": last.isoformat(), "complete": complete,
        "goal": goal, "status": "insufficient",
        "weight": {"first": _round(weight_first, 2), "last": _round(weight_last, 2),
                   "delta": _round(weight_delta, 2), "percent": _round(weight_pct, 2),
                   "entries": len(weights), "weekly_counts": weekly_counts,
                   "weeks": weeks, "method": "weekly_latest"},
        "waist": {"first": _round(waist_first, 1), "last": _round(waist_last, 1),
                  "delta": _round(waist_delta, 1), "entries": len(waists),
                  "method": "week1_to_week4"},
        "circumferences": circumferences,
        "nutrition": {"days": len(logged), "early_days": len(food_early),
                      "late_days": len(food_late), "average_kcal": _round(food_mean),
                      "target_kcal": kcal},
        "activity": {"days": len(steps), "first_steps": _round(steps_before, 0),
                     "last_steps": _round(steps_after, 0)},
        "current": {"kcal": kcal, "protein": protein, "fat": fat, "carbs": carbs},
        "recommended": None, "reasons": reasons, "warnings": warnings,
    }
    if not complete:
        report["status"] = "in_progress"
        return report
    if reasons:
        return report
    report["status"] = "hold"
    if goal in ("maintain", "recomp"):
        reasons.append("Для підтримання та рекомпозиції зміни калорій не пропонуються автоматично; оцінюй динаміку разом із тренером.")
        return report

    if goal == "loss":
        if weight_pct is not None and weight_pct <= -.5:
            reasons.append("Вага зменшується за 4 тижні. Поточну ціль варто зберегти.")
            return report
        if waist_delta is not None and waist_delta <= -.5:
            reasons.append("Талія зменшується навіть без значної зміни ваги. Дефіцит не збільшуємо.")
            return report
        delta_carbs = -30
        reasons.append("Вага й талія суттєво не змінилися за стабільного харчування.")
    else:
        if weight_pct is not None and weight_pct >= .5:
            reasons.append("Вага вже зростає. Калорійність поки не підвищуємо.")
            return report
        if waist_delta is not None and waist_delta >= 1.5:
            reasons.append("Талія помітно зросла. Перед збільшенням калорій потрібна оцінка тренера.")
            return report
        delta_carbs = 30
        reasons.append("Вага істотно не збільшується за достатнього обліку харчування.")

    new_carbs = carbs + delta_carbs
    new_energy = protein*4 + fat*9 + new_carbs*4
    if new_carbs < 30 or new_energy < 1200 or new_energy > 6000:
        reasons.append("Безпечна корекція вуглеводів виходить за межі допустимого діапазону.")
        return report
    report["status"] = "suggested"
    report["recommended"] = {"kcal": new_energy, "protein": protein,
                             "fat": fat, "carbs": new_carbs}
    warnings.append("Це рекомендація, не призначення. Перевір повноту харчових записів, самопочуття та зміни цілі; нове БЖВ збереже лише тренер.")
    return report
