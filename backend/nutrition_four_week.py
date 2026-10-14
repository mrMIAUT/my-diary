"""Conservative, read-only 28-day nutrition review for a trainer.

Four 7-day buckets prevent sparse or clustered measurements being mistaken
for a genuine trend. This module never writes goals or meal plans. It only
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
                      activity, today):
    if goal not in VALID_GOALS:
        raise ValueError("Trainer must explicitly select a valid goal")
    last = _day(today)
    if last is None:
        raise ValueError("Invalid review date")
    start = last - timedelta(days=27)
    middle = start + timedelta(days=14)
    progress = []
    warnings = []
    reasons = []
    kcal = int(_finite(target.get("kcal"), 0, 7000) or 0)
    protein = int(_finite(target.get("protein"), 0, 1000) or 0)
    fat = int(_finite(target.get("fat"), 0, 1000) or 0)
    carbs = int(_finite(target.get("carbs"), 0, 1000) or 0)
    goal_energy = protein*4 + fat*9 + carbs*4

    weights = _series(measurements, "weight", start, last, 30, 350)
    waists = _series(measurements, "waist", start, last, 35, 230)
    early_weights = [value for when, value in weights.items() if when < middle]
    late_weights = [value for when, value in weights.items() if when >= middle]
    early_waists = [value for when, value in waists.items() if when < middle]
    late_waists = [value for when, value in waists.items() if when >= middle]
    weight_early = mean(early_weights) if early_weights else None
    weight_late = mean(late_weights) if late_weights else None
    waist_early = mean(early_waists) if early_waists else None
    waist_late = mean(late_waists) if late_waists else None
    weight_delta = weight_late - weight_early if weight_early is not None and weight_late is not None else None
    weight_pct = weight_delta / weight_early * 100 if weight_delta is not None and weight_early else None
    waist_delta = waist_late - waist_early if waist_early is not None and waist_late is not None else None

    # A date near each edge, every week covered, and two independent
    # weigh-ins in each half. Weekly check-ins (not daily weigh-ins) qualify.
    buckets = [sum(1 for when in weights if start+timedelta(days=7*i) <= when <
                   start+timedelta(days=7*(i+1))) for i in range(4)]
    if len(early_weights) < 2 or len(late_weights) < 2 or any(not n for n in buckets):
        reasons.append("Заміряй вагу хоча б раз на кожному з 4 тижнів (мінімум 2 записи в кожній половині).")
    if not early_waists or not late_waists:
        reasons.append("Для оцінки складу тіла потрібні заміри талії на початку та наприкінці періоду.")

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

    report = {
        "period_start": start.isoformat(), "period_end": last.isoformat(),
        "goal": goal, "status": "insufficient",
        "weight": {"first": _round(weight_early, 2), "last": _round(weight_late, 2),
                   "delta": _round(weight_delta, 2), "percent": _round(weight_pct, 2),
                   "entries": len(weights), "weekly_counts": buckets},
        "waist": {"first": _round(waist_early, 1), "last": _round(waist_late, 1),
                  "delta": _round(waist_delta, 1), "entries": len(waists)},
        "nutrition": {"days": len(logged), "early_days": len(food_early),
                      "late_days": len(food_late), "average_kcal": _round(food_mean),
                      "target_kcal": kcal},
        "activity": {"days": len(steps), "first_steps": _round(steps_before, 0),
                     "last_steps": _round(steps_after, 0)},
        "current": {"kcal": kcal, "protein": protein, "fat": fat, "carbs": carbs},
        "recommended": None, "reasons": reasons, "warnings": warnings,
    }
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
