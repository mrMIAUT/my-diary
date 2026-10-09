"""Read-only source matching report for unfilled EPLAN 1.2 foods.

Downloads the same pinned official USDA archives as the existing importer.
Search patterns are review aids, NEVER automated approvals. Prints compact
source evidence for human review and exports all proposed official records.
"""
import json
import argparse
import re
from pathlib import Path
from food_local_catalog import candidate_manifest
from import_usda_curated import EXPECTED_ARCHIVE_SHA256
from usda_source_scan import OFFICIAL_ARCHIVES, load_source

# English USDA description token patterns. Multiple alternatives separated by
# semicolons. A hit must match ALL words of a selected alternative. Search
# only: no source ID is created by this file.
QUERIES = {
 "Куряче філе (сире)":"chicken breast meat only raw",
 "Куряче філе (відварене)":"chicken breast meat only cooked stewed;chicken breast cooked boiled",
 "Куряче стегно без шкіри (сире)":"chicken thigh meat only raw",
 "Куряча гомілка без шкіри (сира)":"chicken drumstick meat only raw",
 "Курка ціла без шкіри (сира)":"chicken meat only raw",
 "Філе індички (сире)":"turkey breast meat only raw",
 "Філе індички (запечене)":"turkey breast meat only cooked roasted",
 "Стегно індички без шкіри (сире)":"turkey thigh meat only raw",
 "Качине філе без шкіри (сире)":"duck breast meat only raw",
 "Качине філе зі шкірою (сире)":"duck breast meat skin raw",
 "Яловичина пісна (сира)":"beef lean only raw",
 "Яловичина середньої жирності (сира)":"beef separable lean fat raw",
 "Яловичий оковалок (сирий)":"beef round bottom raw;beef round top raw",
 "Яловичина (тушкована без олії)":"beef cooked braised",
 "Яловичина (відварена)":"beef cooked simmered",
 "Свинина ошийок (сирий)":"pork neck raw",
 "Свинина пісна (запечена)":"pork lean only cooked roasted",
 "Свинячий фарш 10% жиру (сирий)":"pork ground raw",
 "Свинячий фарш 20% жиру (сирий)":"pork ground raw",
 "Баранина пісна (сира)":"lamb lean only raw",
 "Баранина нога (сира)":"lamb leg raw",
 "Сало свиняче солоне":"pork salt pork;fatback pork salted",
 "Тріска (відварена)":"cod cooked dry heat;cod cooked",
 "Хек (сирий)":"fish hake raw;fish whiting raw",
 "Хек (запечений)":"fish hake cooked",
 "Минтай (відварений)":"fish pollock cooked",
 "Скумбрія (копчена)":"fish mackerel smoked",
 "Оселедець солоний":"fish herring pickled;fish herring salted",
 "Сардина (сира)":"fish sardine raw",
 "Сардини у власному соку (консервовані)":"sardines canned water",
 "Шпроти в олії (консервовані)":"sprat canned oil;fish sprat",
 "Карась (сирий)":"fish crucian raw",
 "Судак (сирий)":"fish pikeperch raw;fish walleye raw",
 "Щука (сира)":"fish pike raw",
 "Дорадо (сире)":"fish sea bream raw;fish gilt head bream",
 "Кальмар (відварений)":"squid cooked",
 "Крабове м'ясо (відварене)":"crab cooked moist heat",
 "Морська капуста (сира)":"seaweed kelp raw",
 "Морська капуста (маринована)":"seaweed kelp pickled",
 "Ікра лососева солона":"fish roe salmon salted;caviar salmon",
 "Яйце куряче (варене некруто)":"egg whole cooked soft boiled",
 "Білок курячого яйця (варений)":"egg white cooked",
 "Молоко коров'яче 0,5%":"milk 0.5% fat",
 "Молоко коров'яче 1,5%":"milk 1.5% fat",
 "Молоко коров'яче 2,5%":"milk 2.5% fat",
 "Молоко коров'яче 3,2%":"milk 3.2% fat",
 "Молоко безлактозне 2,5%":"milk lactose free 2.5%",
 "Кефір 1%":"kefir lowfat plain",
 "Кефір 2,5%":"kefir plain 2.5%",
 "Кефір 3,2%":"kefir plain 3.2%",
 "Йогурт натуральний без цукру 2%":"yogurt plain lowfat",
 "Йогурт грецький натуральний 2%":"yogurt greek plain lowfat",
 "Йогурт грецький натуральний 5%":"yogurt greek plain whole",
 "Йогурт грецький натуральний 10%":"yogurt greek plain 10%",
 "Ряжанка 2,5%":"ryazhenka",
 "Ряжанка 4%":"ryazhenka",
 "Сир кисломолочний 0%":"cheese cottage nonfat",
 "Сир кисломолочний 2%":"cheese cottage lowfat 2%",
 "Сир кисломолочний 5%":"cheese cottage 5%",
 "Сир кисломолочний 9%":"cheese cottage 9%",
 "Сметана 10%":"cream sour 10%",
 "Сметана 15%":"cream sour 15%",
 "Сметана 20%":"cream sour 20%",
 "Вершки 10%":"cream light 10%",
 "Вершки 20%":"cream light 20%",
 "Вершки 33%":"cream heavy",
 "Масло вершкове 72,5%":"butter 72.5%",
 "Масло вершкове 82,5%":"butter 82.5%",
 "Сир бринза":"cheese brinza;cheese bryndza",
 "Сир маскарпоне":"cheese mascarpone",
 "Сир вершковий натуральний":"cheese cream",
 "Рис басматі (сухий)":"rice basmati raw;rice basmati dry",
 "Рис басматі (відварений)":"rice basmati cooked",
 "Рис жасмин (сухий)":"rice jasmine raw;rice jasmine dry",
 "Рис жасмин (відварений)":"rice jasmine cooked",
 "Рис дикий (сухий)":"rice wild raw",
 "Вівсяні висівки (сухі)":"bran oat raw",
 "Ячна крупа (суха)":"barley pearled raw;barley hulled raw",
 "Манна крупа (суха)":"semolina unenriched",
 "Кукурудзяна крупа (суха)":"cornmeal degermed;corn grits dry",
 "Полента на воді":"cornmeal cooked water;corn grits cooked",
 "Макарони з пшениці твердих сортів (сухі)":"pasta dry semolina;spaghetti dry unenriched",
 "Макарони з пшениці твердих сортів (відварені)":"pasta cooked semolina;spaghetti cooked unenriched",
 "Макарони цільнозернові (сухі)":"pasta whole wheat dry",
 "Макарони цільнозернові (відварені)":"pasta whole wheat cooked",
 "Локшина рисова (суха)":"rice noodles dry",
 "Локшина рисова (відварена)":"rice noodles cooked",
 "Борошно пшеничне вищого ґатунку":"wheat flour white all purpose unenriched",
 "Борошно пшеничне цільнозернове":"wheat flour whole grain",
 "Борошно житнє":"rye flour",
 "Борошно кукурудзяне":"corn flour whole grain",
 "Крохмаль кукурудзяний":"cornstarch",
 "Сочевиця червона (відварена)":"lentils red cooked",
 "Сочевиця зелена (суха)":"lentils green raw",
 "Сочевиця зелена (відварена)":"lentils green cooked",
 "Квасоля біла (суха)":"beans white raw",
 "Квасоля біла (відварена)":"beans white cooked",
 "Едамаме (відварені)":"edamame cooked",
 "Кабачок (тушкований без олії)":"squash summer cooked boiled",
 "Баклажан (запечений без олії)":"eggplant cooked baked",
 "Броколі (на парі)":"broccoli cooked steamed",
 "Рукола (сира)":"arugula raw",
 "Редька чорна (сира)":"radish black raw",
 "Селера коренева (сира)":"celeriac raw",
 "Гарбуз (запечений)":"pumpkin cooked baked",
 "Кукурудза консервована (без рідини)":"corn sweet canned drained solids",
 "Виноград білий (сирий)":"grapes green raw",
 "Виноград темний (сирий)":"grapes red raw",
 "Чорниця (сира)":"bilberries raw;blueberries wild raw",
 "Смородина чорна (сира)":"currants black raw",
 "Смородина червона (сира)":"currants red raw",
 "Фініки сушені (без кісточок)":"dates medjool;dates deglet noor",
 "Родзинки (сушені)":"raisins seedless",
 "Насіння маку (сухе)":"seeds poppy",
 "Кокосова стружка без цукру":"nuts coconut meat dried not sweetened",
 "Кокосова м'якоть свіжа":"nuts coconut meat raw",
 "Арахісова паста 100%":"peanut butter smooth without salt",
 "Мигдалева паста 100%":"almond butter",
 "Гірчична олія":"oil mustard",
 "Свинячий смалець":"lard",
 "Яловичий жир топлений":"tallow beef",
 "Хліб житньо-пшеничний":"bread rye wheat",
 "Хліб на заквасці пшеничний":"bread sourdough wheat",
 "Хліб на заквасці житній":"bread sourdough rye",
 "Батон пшеничний":"bread french baguette;bread white",
 "Лаваш тонкий пшеничний":"bread lavash",
 "Хлібці рисові":"rice cakes plain",
 "Хлібці гречані":"buckwheat crackers",
 "Сухарі пшеничні без цукру":"bread crumbs dry plain",
 "Булочка пшенична без начинки":"rolls dinner plain",
 "Булочка цільнозернова без начинки":"rolls whole wheat",
 "Бублик простий":"bagel plain",
 "Крекер несолоний":"crackers unsalted",
 "Галети пшеничні":"crackers water",
 "Мед натуральний":"honey",
 "Какао-порошок без цукру":"cocoa dry powder unsweetened",
 "Шоколад молочний":"chocolate milk",
 "Помідори консервовані у власному соку":"tomatoes canned in tomato juice",
 "Огірки мариновані без цукру":"pickles cucumber dill",
 "Квашена капуста без цукру":"sauerkraut canned",
 "Соєвий соус класичний":"soy sauce made from soy",
 "Оцет яблучний 5%":"vinegar cider",
 "Гірчиця столова":"mustard prepared yellow",
 "Кокосове молоко консервоване без цукру":"coconut milk canned",
 "Вівсяний напій без цукру":"oat milk unsweetened",
 "Соєвий напій без цукру":"soy milk unsweetened",
}
def candidate_sources():
    from food_local_catalog import approved_reference_food_items
    approved_ids={i["source_fdc_id"] for i in approved_reference_food_items()}
    from food_local_catalog import candidate_manifest
    from food_local_catalog import NUTRITION_PATH
    stored=json.loads(NUTRITION_PATH.read_text(encoding="utf-8"))
    taken={r["candidate_id"] for r in stored["records"]}
    pending=[x for x in candidate_manifest() if x["id"] not in taken]
    samples=[]
    for label,config in OFFICIAL_ARCHIVES.items():
        source=load_source(label,config)
        if source["archive_sha256"]!=EXPECTED_ARCHIVE_SHA256[label]:
            raise RuntimeError("Official USDA archive fingerprint changed")
        samples.extend(source["foods"])
    # Independent re-audit of already imported records against source rows,
    # not only against their own stored hashes and values.
    actual_by_fdc={r["fdc_id"]:r for r in samples}
    source_errors=[]
    source_flags=[]
    for saved in stored["records"]:
        name=saved["name_uk"]
        official=actual_by_fdc.get(saved["fdc_id"])
        if official is None:
            source_errors.append({"name":name,"error":"official_FDC_ID_missing"})
            continue
        for field,actual in (
            ("source_food_description",official["description"]),
            ("source_archive_sha256",official["source_archive_sha256"]),
            ("source_data_type",official["source_type"]),
        ):
            if saved.get(field)!=actual:
                source_errors.append({"name":name,"error":"source_"+field+"_mismatch"})
        for nutrient in ("kcal_100","protein_100","fat_100","carbs_100"):
            try:
                if abs(saved[nutrient]-official[nutrient])>.011:
                    source_errors.append({"name":name,"error":"nutrition_"+nutrient+"_mismatch"})
            except (KeyError,TypeError,ValueError):
                source_errors.append({"name":name,"error":"missing_"+nutrient})
        source_description=official["description"].lower()
        if saved["preparation_state"]=="raw" and (
            any(cue in source_description for cue in (
                "cooked","roasted","fried","boiled","braised","smoked",
                "canned","pickled","dry roasted","drained solids"
            ))):
            source_flags.append({"name":name,"warning":"raw_label_may_be_prepared",
                                 "source":official["description"]})
        elif saved["preparation_state"]=="cooked" and not any(
            cue in source_description for cue in (
                "cooked","boiled","roasted","baked","steamed","broiled",
                "fried","stewed","simmered","braised","grilled"
            )
        ):
            source_flags.append({"name":name,"warning":"cooked_label_unclear",
                                 "source":official["description"]})
    print("USDA_EXISTING_AUDIT "+json.dumps({
        "stored_records":len(stored["records"]),
        "source_mismatch_errors":source_errors,
        "label_review_flags":source_flags
    },ensure_ascii=False),flush=True)
    groups={}
    for c in pending:
        opts=QUERIES.get(c["name_uk"],"").split(";")
        hits=[]
        for rank,query in enumerate(opts):
            tokens=re.findall(r"[a-z0-9]+",query.lower())
            for row in samples:
                if row["fdc_id"] in approved_ids:continue
                desc=row["description"].casefold()
                if all(re.search(r"(?<![a-z])"+re.escape(word)+r"(?![a-z])",desc)
                       for word in tokens):
                    hits.append((rank,len(desc),row))
        unique={}
        for rank,length,row in sorted(hits,key=lambda x:(x[0],x[1])):
            unique.setdefault(row["fdc_id"],row)
        result=list(unique.values())[:7]
        groups[c["name_uk"]]={"category":c["category"],"candidates":result}
    return groups

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--out",default="usda_pending_source_review.json")
    args=parser.parse_args()
    groups=candidate_sources()
    Path(args.out).write_text(json.dumps(groups,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    for name,entry in groups.items():
        snippets=[{
            "fdc":r["fdc_id"],"en":r["description"],
            "kcal":r["kcal_100"],"p":r["protein_100"],
            "f":r["fat_100"],"c":r["carbs_100"],
        } for r in entry["candidates"][:5]]
        print("USDA_REVIEW "+json.dumps({"name":name,"category":entry["category"],
              "candidates":snippets},ensure_ascii=False),flush=True)
    print("PENDING_REVIEW_SUMMARY "+json.dumps({
        "total":len(groups),
        "candidate_found":sum(bool(g["candidates"]) for g in groups.values()),
        "no_candidate":sum(not g["candidates"] for g in groups.values()),
        "never_auto_approved":True,
    },ensure_ascii=False))

if __name__=="__main__":
    main()
