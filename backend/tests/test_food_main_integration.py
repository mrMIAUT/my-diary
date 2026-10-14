import sys
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from food_reference_catalog import reference_food_items
from food_local_catalog import approved_reference_food_items
from food_manufacturer_catalog import manufacturer_label_food_items


class MainFoodIntegrationTests(unittest.TestCase):
    def test_reviewed_catalogue_loads_without_database(self):
        items = reference_food_items()
        self.assertGreaterEqual(len(items), 300)
        approved = approved_reference_food_items()
        manufacturers = manufacturer_label_food_items()
        self.assertGreaterEqual(len(approved), 260)
        self.assertGreaterEqual(len(manufacturers), 18)

    def test_new_branded_yogurts_and_flavoured_whey_have_exact_labels(self):
        from food_manufacturer_catalog import validate_label_record
        from json import loads
        manifest=loads((BACKEND/"food_manufacturer_labels.json").read_text(encoding="utf-8"))
        new=[r for r in manifest["records"] if r["reviewed_on"]=="2026-10-14" and not r.get("batch_id")]
        self.assertEqual(len(new),24)
        self.assertEqual(sum(r["brand"]=="BioTechUSA" for r in new),8)
        self.assertEqual(sum(r["brand"]=="Галичина" for r in new),16)
        items=manufacturer_label_food_items()
        self.assertGreaterEqual(len(items),42)
        index={x["source_id"]:x for x in items}
        for raw in new:
            with self.subTest(product=raw["id"]):
                result=validate_label_record(raw)
                self.assertEqual(result["brand"],raw["brand"])
                self.assertEqual(result["source_url"],raw["source_url"])
                self.assertEqual(result["food_type"],"branded")
                self.assertIn(result["source_id"],index)
                if raw["brand"]=="BioTechUSA":
                    self.assertLessEqual(result["saturated_fat_100"],result["fat_100"])
                    self.assertLessEqual(result["sugars_100"],result["carbs_100"])
                else:
                    self.assertNotIn("sugars_100",result)
                    self.assertNotIn("saturated_fat_100",result)
        natural=index["eplan12-manufacturer-biotechusa-100-pure-whey-natural"]
        self.assertEqual((natural["kcal_100"],natural["protein_100"]), (406,80))
        self.assertIn(natural,reference_food_items())

    def test_optional_manufacturer_nutrients_fail_closed(self):
        from food_manufacturer_catalog import validate_label_record
        from json import loads
        manifest=loads((BACKEND/"food_manufacturer_labels.json").read_text(encoding="utf-8"))
        natural=next(r for r in manifest["records"] if r["id"]=="biotechusa-100-pure-whey-natural")
        for key,value in (("sugars_100",101),("saturated_fat_100",7),
                          ("sugars_100",-1),("sugars_100","8")):
            with self.subTest(nutrient=key,value=value),self.assertRaises(ValueError):
                validate_label_record({**natural,key:value})


    def test_second_branded_batch_has_exact_sources_and_optional_nutrients(self):
        from json import loads
        from food_manufacturer_catalog import validate_label_record
        data=loads((BACKEND/"food_manufacturer_labels.json").read_text(encoding="utf-8"))
        batch=[r for r in data["records"] if r.get("batch_id")=="2026-10-14-brand-expansion-v321"]
        expected={"Activia":15,"OstroVit":7,"Optimum Nutrition":3,"Myprotein":1}
        self.assertEqual({brand:sum(r["brand"]==brand for r in batch) for brand in expected},expected)
        all_labels=manufacturer_label_food_items()
        self.assertGreaterEqual(len(all_labels),68)
        names={(x["brand"],x["name"]) for x in all_labels}
        for record in batch:
            with self.subTest(product=record["id"]):
                validated=validate_label_record(record)
                self.assertIn((validated["brand"],validated["name"]),names)
                self.assertEqual(validated["source_kind"],"manufacturer_label")
                self.assertFalse(validated["approximate"])
                self.assertLessEqual(validated["sugars_100"],validated["carbs_100"])
                self.assertLessEqual(validated["saturated_fat_100"],validated["fat_100"])
                self.assertEqual(validated["barcode"],record.get("barcode",""))
                self.assertTrue(validated["source_url"].startswith("https://"))
        whey=next(r for r in batch if r["id"]=="myprotein-impact-whey-vanilla-900g")
        self.assertEqual((whey["protein_100"],whey["kcal_100"]), (72,379))
        self.assertIn("variation=10957802",whey["source_url"])
        self.assertIn("eplan12-manufacturer-myprotein-impact-whey-vanilla-900g",
                      {r["source_id"] for r in reference_food_items()})

    def test_manufacturer_variant_urls_and_ean_are_fail_closed(self):
        from json import loads
        from food_manufacturer_catalog import validate_label_record
        data=loads((BACKEND/"food_manufacturer_labels.json").read_text(encoding="utf-8"))
        batch=[r for r in data["records"] if r.get("batch_id")=="2026-10-14-brand-expansion-v321"]
        optimum=next(r for r in batch if r["brand"]=="Optimum Nutrition")
        ostrovit=next(r for r in batch if r["brand"]=="OstroVit")
        for url in (optimum["source_url"]+"&discount=free",
                    optimum["source_url"].replace("variant=","other="),
                    "https://evil.example/unsafe?variant=12345678901",
                    "http://www.optimumnutrition.com/products/?variant=52105832562955"):
            with self.subTest(url=url),self.assertRaises(ValueError):
                validate_label_record({**optimum,"source_url":url})
        for barcode in ("5903933910247","1234567890123","not-an-ean",""):
            # Empty is permitted for brands without verified barcode; bad EAN fails.
            row={**ostrovit,"barcode":barcode}
            if barcode=="":
                self.assertEqual(validate_label_record(row)["barcode"],"")
            else:
                with self.subTest(barcode=barcode),self.assertRaises(ValueError):
                    validate_label_record(row)

    def test_v322_branded_puddings_bars_and_whey_flavours(self):
        from json import loads
        from food_manufacturer_catalog import validate_label_record
        labels=loads((BACKEND/"food_manufacturer_labels.json").read_text(encoding="utf-8"))["records"]
        batch=[r for r in labels if r.get("batch_id")=="2026-10-14-protein-desserts-bars-v322"]
        self.assertEqual(len(batch),24)
        for brand,total in (("Ehrmann",12),("Barebells",8),("Myprotein",4)):
            self.assertEqual(sum(r["brand"]==brand for r in batch),total)
        catalog=manufacturer_label_food_items()
        self.assertGreaterEqual(len(catalog),92)
        ids={r["source_id"] for r in catalog}
        for raw in batch:
            with self.subTest(name=raw["name_uk"]):
                item=validate_label_record(raw)
                self.assertIn(item["source_id"],ids)
                self.assertEqual(item["food_type"],"branded")
                self.assertFalse(item["approximate"])
                self.assertLessEqual(item["saturated_fat_100"],item["fat_100"])
                self.assertLessEqual(item["sugars_100"],item["carbs_100"])
                self.assertFalse(item["barcode"])
                self.assertEqual(item["source_url"],raw["source_url"])
                self.assertEqual(item["preparation_state"],"as_sold")
                self.assertEqual(raw["source_nutrition_basis"],"per_100g_product")
        bar=next(r for r in batch if r["id"]=="barebells-bar-caramel-cashew-55g")
        self.assertEqual([bar[k] for k in ("kcal_100","protein_100","fat_100","carbs_100")],[367,36,15,30])
        whey=next(r for r in batch if r["id"]=="myprotein-clear-whey-vimto-remix")
        self.assertEqual([whey[k] for k in ("kcal_100","protein_100","fat_100","carbs_100")],[340,81,0,3.7])
        self.assertIn("eplan12-manufacturer-ehrmann-vanilla-200g",
                      {r["source_id"] for r in reference_food_items()})

    def test_v322_reject_unverified_external_manufacturer(self):
        from food_manufacturer_catalog import validate_label_record
        from json import loads
        labels=loads((BACKEND/"food_manufacturer_labels.json").read_text(encoding="utf-8"))["records"]
        base=next(r for r in labels if r["id"]=="barebells-bar-caramel-cashew-55g")
        for bad in ("http://barebells.com/product/caramel-cashew/",
                    "https://another-website.com/product/caramel-cashew/",
                    "https://barebells.com/product/caramel-cashew/?unverified=1"):
            with self.subTest(url=bad),self.assertRaises(ValueError):
                validate_label_record({**base,"source_url":bad})

    def test_v323_ready_to_drink_brand_labels_and_ml_units(self):
        from json import loads
        from food_manufacturer_catalog import validate_label_record
        manifest=loads((BACKEND/"food_manufacturer_labels.json").read_text(encoding="utf-8"))
        drinks=[r for r in manifest["records"] if r.get("batch_id")=="2026-10-14-branded-rtd-ml-v323"]
        self.assertEqual(len(drinks),11)
        self.assertEqual(sum(r["brand"]=="Ehrmann" for r in drinks),6)
        self.assertEqual(sum(r["brand"]=="Barebells" for r in drinks),5)
        result=manufacturer_label_food_items()
        self.assertGreaterEqual(len(result),103)
        indexed={i["source_id"]:i for i in result}
        for raw in drinks:
            with self.subTest(name=raw["name_uk"]):
                item=validate_label_record(raw)
                self.assertEqual(item["source_nutrition_basis"],"per_100ml_product")
                self.assertEqual(item["portion_unit"],"ml")
                self.assertEqual(item["package_size_ml"],raw["package_size_ml"])
                self.assertEqual(item["food_type"],"branded")
                self.assertIn(item["source_id"],indexed)
                self.assertLessEqual(item["sugars_100"],item["carbs_100"])
                self.assertFalse(item["barcode"])
        chocolate=indexed["eplan12-manufacturer-barebells-milkshake-chocolate-330ml"]
        self.assertEqual(chocolate["kcal_100"],57)
        self.assertEqual(chocolate["protein_100"],7.3)
        self.assertEqual(chocolate["portion_unit"],"ml")
        solids=[x for x in result if x["source_nutrition_basis"]=="per_100g_product"]
        self.assertEqual(len(solids),92)
        self.assertTrue(all(x["portion_unit"]=="g" for x in solids))
        self.assertIn(chocolate,reference_food_items())

    def test_v323_liquid_basis_does_not_allow_mislabelling_grams(self):
        from json import loads
        from food_manufacturer_catalog import validate_label_record
        rows=loads((BACKEND/"food_manufacturer_labels.json").read_text(encoding="utf-8"))["records"]
        liquid=next(x for x in rows if x["id"]=="ehrmann-high-protein-drink-banana-250ml")
        solid=next(x for x in rows if x["id"]=="barebells-bar-caramel-cashew-55g")
        for bad in ({**liquid,"source_nutrition_basis":"per_100g_product"},
                    {**liquid,"product_kind":"protein_powder"},
                    {**liquid,"package_size_ml":None},
                    {**solid,"source_nutrition_basis":"per_100ml_product"}):
            with self.subTest(name=bad["name_uk"]),self.assertRaises(ValueError):
                validate_label_record(bad)

    def test_v324_manufacturer_everyday_foods(self):
        from json import loads
        from food_manufacturer_catalog import validate_label_record
        data=loads((BACKEND/"food_manufacturer_labels.json").read_text(encoding="utf-8"))
        batch=[row for row in data["records"] if row.get("batch_id")=="2026-10-14-everyday-axa-chumak-v324"]
        self.assertEqual(len(batch),54)
        self.assertEqual(sum(x["brand"]=="AXA" for x in batch),27)
        self.assertEqual(sum(x["brand"]=="Чумак" for x in batch),22)
        self.assertEqual(sum(x["brand"]=="Pasta Prima" for x in batch),5)
        all_items=manufacturer_label_food_items()
        self.assertEqual(len(all_items),157)
        indexed={x["source_id"]:x for x in all_items}
        codes=set()
        for row in batch:
            with self.subTest(product=row["id"]):
                item=validate_label_record(row)
                self.assertIn(item["source_id"],indexed)
                self.assertEqual(item["source_url"],row["source_url"])
                self.assertEqual(item["portion_unit"],"g")
                self.assertEqual(item["source_nutrition_basis"],"per_100g_product")
                self.assertEqual(item["food_type"],"branded")
                self.assertFalse(item["approximate"])
                self.assertFalse(item["barcode"] if row["brand"]=="AXA" else False)
                self.assertLessEqual(item["saturated_fat_100"],item["fat_100"]) if "saturated_fat_100" in item else None
                self.assertLessEqual(item["sugars_100"],item["carbs_100"]) if "sugars_100" in item else None
                if item["barcode"]:
                    self.assertNotIn(item["barcode"],codes)
                    codes.add(item["barcode"])
        self.assertGreaterEqual(len(codes),20)
        self.assertIn(indexed["eplan12-manufacturer-axa-granola-choc-nuts"],reference_food_items())
        self.assertIn(indexed["eplan12-manufacturer-chumak-lagidnyi-250"],reference_food_items())

    def test_v324_rejects_wrong_manufacturer_barcode_and_fat_class(self):
        from json import loads
        from food_manufacturer_catalog import validate_label_record
        data=loads((BACKEND/"food_manufacturer_labels.json").read_text(encoding="utf-8"))
        label=next(x for x in data["records"] if x["id"]=="chumak-mayo-provencal-150")
        for wrong in ({**label,"barcode":"4823096003350"},
                      {**label,"name_uk":label["name_uk"].replace("67%","20%")},
                      {**label,"source_url":"https://other.example/product/393"}):
            with self.assertRaises(ValueError):validate_label_record(wrong)

    def test_nutrition_and_sources_are_bounded(self):
        for row in reference_food_items():
            with self.subTest(name=row["name"]):
                self.assertTrue(row["name"].strip())
                self.assertIn("source", row)
                self.assertIn("preparation_state", row)
                for key in ("kcal_100", "protein_100", "fat_100", "carbs_100"):
                    self.assertGreaterEqual(row[key], 0)
                    self.assertLessEqual(row[key], 905)

    def test_authenticated_food_endpoints_and_navigation(self):
        app = (BACKEND / "app.py").read_text(encoding="utf-8")
        nutrition = (BACKEND / "static/js/nutrition-redesign.js").read_text(encoding="utf-8")
        index = (BACKEND / "static/index.html").read_text(encoding="utf-8")
        shell = (BACKEND / "static/sw.js").read_text(encoding="utf-8")
        for endpoint in ("search", "preview", "local-catalog", "preparation", "chicken-preparation"):
            self.assertIn('@app.get("/api/foods/' + endpoint + '",dependencies=[Depends(require_food_search_access)])', app)
        self.assertIn('require_active_client(user.client_id,"nutrition")', app)
        self.assertIn('RATE_LIMITS["food.search"]=(30,60)', app)
        self.assertIn("window.openFoodSearchLazy = async function(meal='')", nutrition)
        self.assertIn("window.openFoodSearchModal", (BACKEND / "static/js/food-lookup.js").read_text(encoding="utf-8"))
        self.assertNotIn("window.calculateNutritionTargets = function()", nutrition)
        trainer_nutrition = (BACKEND / "static/js/nutrition.js").read_text(encoding="utf-8")
        self.assertIn("window.calculateTrainerNutritionTargets = function()", trainer_nutrition)
        self.assertIn("window.pendingTrainerNutritionTargets={kcal,protein,fat,carbs}", trainer_nutrition)
        self.assertNotIn('src="/static/js/food-lookup.js', index)
        self.assertIn("/static/js/food-lookup.js?v=8", nutrition)
        self.assertIn("lookupLocal(", (BACKEND / "static/js/food-lookup.js").read_text(encoding="utf-8"))
        self.assertIn("/foods/preview", (BACKEND / "static/js/food-lookup.js").read_text(encoding="utf-8"))
        self.assertNotIn("/static/js/food-lookup.js", shell)
        self.assertIn("nutrition-redesign.js?v=323", index)
        self.assertIn("nutrition-redesign.js?v=323", shell)


if __name__ == "__main__":
    unittest.main()
