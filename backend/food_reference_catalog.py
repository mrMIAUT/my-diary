"""Small built-in EPLAN 1.2 reference catalogue for offline/basic lookup.

Values are illustrative nutrition reference averages per 100 g, NOT verified
label data or certified USDA records. Keep these entries explicitly marked
approximate until each has an audited source ID and food-state metadata.
This is only used by PROTOTYPE_MODE; no production DB writes.
"""
# slug, Ukrainian name, kcal, protein, fat, carbohydrates, preparation_state
# Raw/dry and cooked weights are different foods, never interchangeable.
_REFERENCE = (
    ("potato-raw", "Картопля сира", 77, 2.0, 0.1, 17.0, "raw"),
    ("potato-boiled", "Картопля варена", 87, 1.9, 0.1, 20.1, "cooked"),
    ("rice-white-dry", "Рис білий (сухий)", 365, 7.1, 0.7, 80.0, "dry"),
    ("rice-basmati-dry", "Рис басматі (сухий)", 355, 7.1, 0.7, 79.0, "dry"),
    ("rice-boiled", "Рис відварений", 130, 2.7, 0.3, 28.2, "cooked"),
    ("buckwheat-dry", "Гречка (суха)", 343, 13.3, 3.4, 71.5, "dry"),
    ("buckwheat-boiled", "Гречка відварена", 92, 3.4, 0.6, 19.9, "cooked"),
    ("oats-dry", "Вівсяні пластівці (сухі)", 379, 13.2, 6.5, 67.7, "dry"),
    ("pasta-dry", "Макарони (сухі)", 371, 13.0, 1.5, 74.7, "dry"),
    ("chicken-breast-raw", "Куряче філе (сире)", 120, 22.5, 2.6, 0.0, "raw"),
    ("turkey-breast-raw", "Філе індички (сире)", 114, 23.7, 1.5, 0.0, "raw"),
    ("beef-lean-raw", "Яловичина нежирна (сира)", 145, 21.0, 7.0, 0.0, "raw"),
    ("egg-raw", "Яйце куряче (сире)", 143, 12.6, 9.5, 0.7, "raw"),
    ("milk-2-5", "Молоко 2,5%", 52, 2.8, 2.5, 4.7, "as_sold"),
    ("kefir-2-5", "Кефір 2,5%", 53, 3.0, 2.5, 4.0, "as_sold"),
    ("cottage-5", "Сир кисломолочний 5%", 121, 17.0, 5.0, 3.0, "as_sold"),
    ("yogurt-natural", "Йогурт натуральний 2%", 61, 4.3, 2.0, 6.5, "as_sold"),
    ("apple-raw", "Яблуко свіже", 52, 0.3, 0.2, 13.8, "raw"),
    ("banana-raw", "Банан свіжий", 89, 1.1, 0.3, 22.8, "raw"),
    ("tomato-raw", "Помідор свіжий", 18, 0.9, 0.2, 3.9, "raw"),
    ("cucumber-raw", "Огірок свіжий", 15, 0.7, 0.1, 3.6, "raw"),
    ("carrot-raw", "Морква сира", 41, 0.9, 0.2, 9.6, "raw"),
    ("olive-oil", "Оливкова олія", 884, 0.0, 100.0, 0.0, "as_sold"),
    ("sunflower-oil", "Соняшникова олія", 884, 0.0, 100.0, 0.0, "as_sold"),
    ("salmon-raw", "Лосось (сирий)", 208, 20.0, 13.0, 0.0, "raw"),
    ("tuna-raw", "Тунець (сирий)", 109, 24.0, 0.5, 0.0, "raw"),
)

def reference_food_items():
    """Return provisional foods plus separately source-reviewed local records.

    The 26 existing entries remain explicitly approximate. Candidate names
    are never searchable until an independently reviewed source record exists.
    """
    illustrative = [
        {
            "source": "reference",
            "source_label": "Орієнтовні довідкові БЖВ",
            "source_id": "eplan12-" + slug,
            "barcode": "",
            "name": name,
            "brand": "",
            "kcal_100": float(kcal),
            "protein_100": float(protein),
            "fat_100": float(fat),
            "carbs_100": float(carbs),
            "data_type": "reference",
            "food_type": "generic",
            "preparation_state": state,
            "approximate": True,
        }
        for slug, name, kcal, protein, fat, carbs, state in _REFERENCE
    ]
    try:
        from food_local_catalog import approved_reference_food_items
        reviewed = approved_reference_food_items()
    except (ImportError, OSError, ValueError, TypeError):
        # An invalid optional reviewed catalog must never break existing food
        # search or make a half-reviewed entry available in the diary.
        reviewed = ()
    try:
        from food_manufacturer_catalog import manufacturer_label_food_items
        labels = manufacturer_label_food_items()
    except (ImportError, OSError, ValueError, TypeError):
        # Manufacturer label records remain optional and fail closed:
        # never misrepresent an invalid product label as approved food.
        labels = ()
    return illustrative + [dict(item) for item in reviewed] + [dict(item) for item in labels]
