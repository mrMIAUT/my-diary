"""Deterministic, trainer-reviewed draft meal plans from approved source-linked foods.

No external APIs, generative hallucinations, database writes or allergy guarantees.
Portions are always labeled in the catalog's food preparation state.
"""
from functools import lru_cache
from food_local_catalog import approved_reference_food_items
from nutrition_structured import FREE_VEGETABLE_NAMES,EGG_NAMES,EGG_EDIBLE_GRAMS

# Food names must match audited food_local_nutrition.json exactly.
# Bounds are edible grams in the precisely specified state (raw/dry/cooked/as_sold).
# (name, minimum g, maximum g, increment g, starting g, restriction tags)
FOODS = {
    "oats": ("Вівсяні пластівці (сухі)", 35, 125, 5, 65, ("gluten",)),
    "oats_cooked": ("Вівсяна каша на воді", 120, 350, 5, 240, ("gluten",)),
    "yogurt": ("Йогурт грецький натуральний 5%", 90, 320, 5, 170, ("dairy",)),
    "banana": ("Банан (сирий, без шкірки)", 70, 210, 5, 120, ()),
    "apple": ("Яблуко (сире, без серцевини)", 80, 250, 5, 160, ()),
    "walnuts": ("Волоський горіх (ядро)", 0, 40, 5, 15, ("nuts",)),
    "almonds": ("Мигдаль (сирий)", 0, 40, 5, 15, ("nuts",)),
    "avocado": ("Авокадо (сире, м'якоть)", 0, 160, 5, 60, ()),
    "bread": ("Хліб пшеничний цільнозерновий", 50, 180, 5, 85, ("gluten",)),
    "eggs": ("Яйце куряче (варене круто)", 50, 250, 50, 100, ("eggs",)),
    "buckwheat": ("Гречка (відварена)", 120, 380, 5, 200, ()),
    "rice": ("Рис білий (відварений)", 100, 350, 5, 200, ()),
    "potatoes": ("Картопля (відварена без шкірки)", 140, 420, 5, 250, ()),
    "pasta": ("Макарони цільнозернові (відварені)", 110, 360, 5, 220, ("gluten",)),
    "chicken": ("Куряче філе (запечене)", 90, 260, 5, 160, ("meat",)),
    "turkey": ("Філе індички (запечене)", 90, 280, 5, 180, ("meat",)),
    "salmon": ("Лосось атлантичний (запечений)", 90, 240, 5, 160, ("fish",)),
    "tuna": ("Тунець у власному соку (консервований)", 85, 260, 5, 170, ("fish",)),
    "beans": ("Квасоля червона (відварена)", 120, 350, 5, 230, ()),
    "tomato": ("Помідор (сирий)", 90, 220, 5, 120, ()),
    "cucumber": ("Огірок (сирий)", 90, 230, 5, 130, ()),
    "spinach": ("Шпинат (сирий)", 60, 170, 5, 100, ()),
    "carrot": ("Морква (відварена)", 90, 210, 5, 120, ()),
    "oil": ("Оливкова олія", 0, 27, 1, 10, ()),
}
EXCLUSIONS = frozenset(("dairy", "eggs", "fish", "nuts", "gluten", "meat"))
# Food combinations chosen for straightforward meals, not arbitrary nutrient sums.
TEMPLATES = {
    "breakfast": [
        ("oats", "yogurt", "banana", "walnuts"),
        ("bread", "eggs", "avocado", "tomato", "banana"),
        ("buckwheat", "turkey", "tomato", "cucumber"),
        ("oats_cooked", "banana", "almonds", "yogurt"),
    ],
    "lunch": [
        ("chicken", "rice", "tomato", "cucumber", "oil"),
        ("turkey", "buckwheat", "cucumber", "tomato", "oil"),
        ("salmon", "potatoes", "cucumber", "tomato"),
        ("tuna", "rice", "tomato", "cucumber", "oil"),
        ("beans", "rice", "avocado", "tomato"),
    ],
    "snack": [
        ("yogurt", "banana", "walnuts"),
        ("tuna", "bread", "cucumber", "avocado"),
        ("eggs", "apple", "almonds"),
        ("turkey", "bread", "cucumber", "apple"),
        ("beans", "bread", "tomato", "avocado"),
    ],
    "dinner": [
        ("salmon", "potatoes", "spinach"),
        ("chicken", "pasta", "tomato", "spinach", "oil"),
        ("turkey", "buckwheat", "tomato", "cucumber", "oil"),
        ("beans", "rice", "spinach", "oil"),
    ],
    "evening": [
        ("yogurt", "apple", "walnuts"),
        ("eggs", "bread", "cucumber"),
        ("turkey", "bread", "cucumber"),
        ("beans", "avocado", "tomato"),
    ],
}
# A fixed dish name, preparation and ingredient roles accompany each approved
# combination. Oils are always culinary ingredients (dressing or mixed in a
# prepared dish), never presented as a separate food to consume or drink.
MEAL_RECIPES = {
    "breakfast": [
        ("Вівсянка з йогуртом, бананом і горіхами",
         "Приготуй пластівці на воді, додай грецький йогурт, банан і волоські горіхи. Вівсяні пластівці зважуй сухими.",
         {"oats": "Суха вага до варіння", "walnuts": "Подрібнити й додати в кашу"}),
        ("Тости з яйцем, авокадо й помідором + банан",
         "Хліб підсмаж, виклади нарізані варені яйця, авокадо та помідор. Банан з'їж окремо як фрукт до сніданку.",
         {"eggs": "Варені яйця, поштучно", "banana": "Фрукт до сніданку"}),
        ("Гречка з індичкою та свіжими овочами",
         "Подавай готову гречку з індичкою та салатом з помідора й огірка.",
         {"buckwheat": "Вага після варіння"}),
        ("Вівсяна каша з йогуртом, бананом і мигдалем",
         "До готової каші на воді додай натуральний йогурт, банан та подрібнений мигдаль.",
         {"oats_cooked": "Вага вже готової каші"}),
    ],
    "lunch": [
        ("Куряче філе з рисом та овочевим салатом",
         "Запечене куряче філе подай з відвареним рисом. Огірок і помідор наріж у салат, заправ оливковою олією.",
         {"rice": "Вага готового рису", "oil": "Заправка для салату, не окремий продукт"}),
        ("Індичка з гречкою та салатом",
         "Запечене філе індички подай з гречкою. Наріж огірок і помідор, заправ овочі оливковою олією.",
         {"buckwheat": "Вага готової гречки", "oil": "Заправка для салату, не окремий продукт"}),
        ("Лосось із картоплею та овочевим салатом",
         "Запечений лосось подай із відвареною картоплею, помідором та огірком.",
         {"potatoes": "Вага готової картоплі"}),
        ("Рисовий боул з тунцем та овочами",
         "Змішай готовий рис, тунець без рідини, помідор та огірок. Оливкову олію додай як заправку.",
         {"rice": "Вага готового рису", "oil": "Заправка боулу, не окремий продукт"}),
        ("Боул із рисом, квасолею й авокадо",
         "З'єднай відварені рис і квасолю, нарізані авокадо та помідор.",
         {"rice": "Вага після варіння", "beans": "Вага готової квасолі"}),
    ],
    "snack": [
        ("Йогурт з бананом та волоськими горіхами",
         "Наріж банан у миску з йогуртом, посип подрібненими горіхами.",
         {}),
        ("Тости з тунцем, авокадо та огірком",
         "Підсмаж хліб, виклади тунець без рідини, авокадо й огірок.",
         {"tuna": "Тунець без рідини"}),
        ("Варені яйця, яблуко та мигдаль",
         "Яйця відвари, яблуко та мигдаль подай як окремий перекус.",
         {"eggs": "Поштучно"}),
        ("Сендвіч з індичкою та огірком + яблуко",
         "Зроби сендвіч із хліба, готової індички та огірка. Яблуко — окремо.",
         {"apple": "Фрукт до перекусу"}),
        ("Тости з пастою з квасолі, авокадо й томатів",
         "Розімни готову квасолю з авокадо, нанеси на тости, додай нарізаний помідор.",
         {"beans": "Відварена квасоля"}),
    ],
    "dinner": [
        ("Лосось з картоплею та шпинатом",
         "Подавай запечений лосось із відвареною картоплею та шпинатом.",
         {"potatoes": "Вага готової картоплі"}),
        ("Паста з куркою, помідорами та шпинатом",
         "Змішай готову пасту з нарізаною запеченою куркою, помідором і шпинатом. Оливкову олію додай до пасти під час змішування.",
         {"pasta": "Вага готових макаронів", "oil": "Додати у пасту, не вживати окремо"}),
        ("Індичка з гречкою та салатом",
         "Запечену індичку подай з готовою гречкою. З помідора й огірка зроби салат та заправ оливковою олією.",
         {"buckwheat": "Вага готової гречки", "oil": "Заправка для салату, не окремий продукт"}),
        ("Рис із квасолею та шпинатом",
         "Змішай готові рис і квасолю зі шпинатом. Оливкову олію додай у готову страву.",
         {"oil": "Додати у готову страву, не окремий продукт"}),
    ],
    "evening": [
        ("Йогурт з яблуком та горіхами",
         "Наріж яблуко до йогурту та додай волоські горіхи.",
         {}),
        ("Сендвіч з яйцем та огірком",
         "Підсмаж хліб, додай нарізані варені яйця й огірок.",
         {"eggs": "Поштучно"}),
        ("Сендвіч з індичкою та огірком",
         "На хліб виклади запечену індичку та свіжий огірок.",
         {}),
        ("Салат із квасолею, авокадо та помідором",
         "Змішай готову квасолю з нарізаними авокадо та помідором.",
         {}),
    ],
}
# Recipe and template indexes are intentionally aligned; reject accidental drift.
assert all(len(MEAL_RECIPES[k]) == len(v) for k,v in TEMPLATES.items())

SCHEDULES = {
    3: (("breakfast", .30), ("lunch", .38), ("dinner", .32)),
    4: (("breakfast", .27), ("lunch", .35), ("snack", .14), ("dinner", .24)),
    5: (("breakfast", .23), ("lunch", .28), ("snack", .13),
        ("dinner", .25), ("evening", .11)),
}
LABELS = {
    "breakfast": "Сніданок", "lunch": "Обід", "snack": "Перекус",
    "dinner": "Вечеря", "evening": "Другий перекус",
}
NUTRIENTS = ("kcal", "protein", "fat", "carbs")
FOOD_NUTRIENTS = ("kcal_100", "protein_100", "fat_100", "carbs_100")


@lru_cache(maxsize=1)
def approved_plan_catalog():
    """Only audited USDA records. Never silently substitute illustrative values."""
    approved = {x["name"]: x for x in approved_reference_food_items()}
    used = {}
    for key, (name, *_rest) in FOODS.items():
        item = approved.get(name)
        if not item or item.get("review_status") != "approved" or item.get("approximate", True):
            raise ValueError("A planned food lacks source-approved nutrition: " + name)
        used[key] = item
    return used


def _values(food, grams):
    return [float(food[f]) * grams / 100 for f in FOOD_NUTRIENTS]


def _nutrition(food_keys, grams, foods, include_vegetables=False):
    return [sum(_values(foods[key], g)[i] for key, g in zip(food_keys, grams)
                if include_vegetables or foods[key]["name"] not in FREE_VEGETABLE_NAMES)
            for i in range(4)]


def _score(actual, target, grams, defaults):
    # Avoid finding absurd portions just to improve matching by a few kcal.
    weights = (0.9, 2.0, 1.55, 1.1)
    fit = sum(w * ((v - t) / max(t, 18.0)) ** 2
              for v, t, w in zip(actual, target, weights))
    plausible = sum(.012 * ((g - d) / max(25.0, d)) ** 2
                    for g, d in zip(grams, defaults))
    return fit + plausible


def _fit_meal(keys, target, foods):
    bounds = [FOODS[k] for k in keys]
    grams = [int(item[4]) for item in bounds]
    defaults = list(grams)
    # Small bounded coordinate search. Pure Python; ~1000-3000 evaluations / dish.
    for _ in range(6):
        changed = False
        for i, (_, lo, hi, step, *_rest) in enumerate(bounds):
            best = grams[i]
            best_score = _score(_nutrition(keys, grams, foods), target, grams, defaults)
            for candidate in range(lo, hi + 1, step):
                if candidate == grams[i]:
                    continue
                trial = list(grams)
                trial[i] = candidate
                score = _score(_nutrition(keys, trial, foods), target, trial, defaults)
                if score < best_score - 1e-9:
                    best_score = score
                    best = candidate
            if best != grams[i]:
                grams[i] = best
                changed = True
        if not changed:
            break
    vals = _nutrition(keys, grams, foods)
    actual = _nutrition(keys, grams, foods,include_vegetables=True)
    rows=[]
    for i,k in enumerate(keys):
        if grams[i] <= 0: continue
        food=foods[k]
        name=food["name"]
        egg=name in EGG_NAMES
        vegetables=name in FREE_VEGETABLE_NAMES
        detail={
            "source_id":food["source_id"],
            "name":name,"state":food["preparation_state"],
            "grams":grams[i], "count":grams[i]//EGG_EDIBLE_GRAMS if egg else None,
            "unit":"pcs" if egg else "g",
            "count_in_targets":not vegetables,
            "optional_vegetable":vegetables,
            "kcal":round(_values(food,grams[i])[0],1),
            "protein":round(_values(food,grams[i])[1],1),
            "fat":round(_values(food,grams[i])[2],1),
            "carbs":round(_values(food,grams[i])[3],1)
        }
        rows.append(detail)
    total={n:round(v,1) for n,v in zip(NUTRIENTS,vals)}
    gross={n:round(v,1) for n,v in zip(NUTRIENTS,actual)}
    return rows,total,gross

def _percent_diff(actual, target):
    return round(100 * (actual - target) / target, 1) if target else 0.0


def generate_meal_plan(kcal, protein, fat, carbs, meals=4, variants=2, excluded=()):
    """Generate editable suggestions; caller must verify and explicitly save.

    Preserving source-kcal totals (instead of recomputing 4/9/4) exposes
    legitimate rounding/fibre differences between official nutrition sources.
    """
    if meals not in SCHEDULES or variants not in (1, 2):
        raise ValueError("Оберіть 3–5 прийомів їжі та 1–2 варіанти.")
    excluded = frozenset(excluded)
    if not excluded.issubset(EXCLUSIONS):
        raise ValueError("Невідоме обмеження продуктів.")
    targets = (float(kcal), float(protein), float(fat), float(carbs))
    if not (1200 <= kcal <= 5000 and 55 <= protein <= 350
            and 25 <= fat <= 190 and 70 <= carbs <= 700):
        raise ValueError("Спочатку призначте реалістичні калорії та БЖВ.")
    if abs(4 * protein + 9 * fat + 4 * carbs - kcal) > max(180, kcal * .12):
        raise ValueError("Калорії не узгоджуються з БЖВ. Перевірте цілі перед створенням плану.")
    foods = approved_plan_catalog()
    result = []
    daily = [0.0] * 4
    for meal_index, (kind, portion) in enumerate(SCHEDULES[meals], start=1):
        suitable = [(template, MEAL_RECIPES[kind][index])
                    for index, template in enumerate(TEMPLATES[kind])
                    if all(not excluded.intersection(FOODS[k][-1]) for k in template)]
        if len(suitable) < variants:
            raise ValueError("За вибраних обмежень бракує перевірених продуктів для "
                             + LABELS[kind].lower() + ". Змініть обмеження або складіть план вручну.")
        target = tuple(v * portion for v in targets)
        for variant_index, (keys, recipe) in enumerate(suitable[:variants], start=1):
            title, preparation, food_notes = recipe
            rows, total, gross = _fit_meal(keys, target, foods)
            for key, row in zip(keys, rows):
                row["usage_note"] = food_notes.get(key, "")
            # Olive oil is always a recipe ingredient, with an explicit use
            # description. It is still counted in the nutrient calculation.
            if any(key == "oil" for key in keys):
                if "оливков" not in preparation.lower() or not food_notes.get("oil"):
                    raise ValueError("Олію потрібно додавати до страви, а не подавати окремо.")
            if variant_index == 1:
                for i, n in enumerate(NUTRIENTS):
                    daily[i] += total[n]
            lines = [f'{row["name"]} — {row["count"]} шт.' if row["count"] is not None
                     else f'{row["name"]} — {row["grams"]} г' for row in rows]
            content = "\n".join(lines)
            content += ("\n\nОрієнтовно на прийом: "
                        + f'{total["kcal"]:.0f} ккал · Б {total["protein"]:.0f} г'
                        + f' · Ж {total["fat"]:.0f} г · В {total["carbs"]:.0f} г')
            result.append({
                "meal_number": meal_index, "meal_name": LABELS[kind],
                "variant_number": variant_index, "sort": len(result),
                "foods": rows, "totals": total, "actual_totals": gross,
                "dish_title": title, "preparation": preparation, "content": content,
            })
    total = {key: round(value, 1) for key, value in zip(NUTRIENTS, daily)}
    target_dict = dict(zip(NUTRIENTS, targets))
    deltas = {key: _percent_diff(total[key], target_dict[key]) for key in NUTRIENTS}
    quality_ok = all(abs(deltas[k]) <= limit for k, limit in (
        ("kcal", 15), ("protein", 20), ("fat", 25), ("carbs", 20)))
    return {
        "targets": target_dict, "totals": total, "deviations_pct": deltas,
        "within_tolerance": quality_ok, "meals": result,
        "source": "USDA FoodData Central · перевірені локальні записи",
        "review_required": True,
        "warnings": [
            "Чернетка, а не готова медична дієта. Тренер має перевірити склад, доцільність і порції.",
            "Вага кожного продукту відповідає стану в назві (сухий, варений, запечений тощо).",
            "Виключення продуктів за категоріями не гарантує відсутності алергенів або перехресного контакту.",
            "У добовому підсумку враховано тільки варіант 1 кожного прийому; альтернативи не додаються разом.",
            "Некрохмалисті овочі за замовчуванням не включені до цільових БЖВ, але враховуються у фактичній енергії.",
            "Яйця враховуються цілими штуками за 50 г їстівної частини; точна маса відрізняється.",
        ],
    }
