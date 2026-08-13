import openpyxl
import json
import re
import unicodedata

EXCEL_FILE = "data/CPTS-communes.xlsx"
OUTPUT_JSON = "public/cpts_communes.json"

def clean_dpt(val):
    if val is None:
        return ""
    val_str = str(val).strip()
    if val_str.isdigit():
        return val_str.zfill(2)
    return val_str

def clean_insee(val):
    if val is None:
        return ""
    val_str = str(val).strip()
    if val_str.isdigit():
        return val_str.zfill(5)
    return val_str

def normalize_name(name):
    if not name:
        return ""
    s = str(name).lower()
    # Normalize accents
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    s = s.replace("-", " ").replace("'", " ")
    s = re.sub(r"\s+", " ", s).strip()
    # Replace st/ste
    s = re.sub(r"\bst\b", "saint", s)
    s = re.sub(r"\bste\b", "sainte", s)
    return s

def main():
    wb = openpyxl.load_workbook(EXCEL_FILE, read_only=True)
    sheet = wb.active
    rows = list(sheet.iter_rows(values_only=True))[1:]

    cpts_map = {}
    cpts_by_dpt = {}

    for r in rows:
        dpt_val, insee_val, lib_val, cpts_val = r[0], r[1], r[2], r[3]
        if not cpts_val:
            continue
        
        dpt = clean_dpt(dpt_val)
        insee = clean_insee(insee_val)
        lib = str(lib_val).strip() if lib_val else ""
        cpts = str(cpts_val).strip()

        # Add to cptsMap
        if insee:
            cpts_map[insee] = cpts
        if lib:
            cpts_map[lib] = cpts
            norm_lib = normalize_name(lib)
            cpts_map[norm_lib] = cpts
            
            # Also add without the (DPT) suffix if present (e.g. "Aiglun (04)" -> "aiglun")
            clean_lib_match = re.match(r"^([^(]+)", lib)
            if clean_lib_match:
                clean_lib_name = clean_lib_match.group(1).strip()
                cpts_map[normalize_name(clean_lib_name)] = cpts

        # Add to cpts_by_dpt
        if dpt:
            if dpt not in cpts_by_dpt:
                cpts_by_dpt[dpt] = set()
            cpts_by_dpt[dpt].add(cpts)

    # Convert sets to sorted lists
    cpts_by_dpt_sorted = {}
    for dpt, cpts_set in sorted(cpts_by_dpt.items()):
        cpts_by_dpt_sorted[dpt] = sorted(list(cpts_set))

    payload = {
        "cptsMap": cpts_map,
        "cptsByDpt": cpts_by_dpt_sorted
    }

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"Generated {OUTPUT_JSON}")
    print(f"   - Communes mapped: {len(cpts_map)}")
    print(f"   - Departments processed: {list(cpts_by_dpt_sorted.keys())}")
    for dpt, lst in cpts_by_dpt_sorted.items():
        print(f"     * Dept {dpt}: {len(lst)} CPTS")

if __name__ == "__main__":
    main()
