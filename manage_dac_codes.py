import hashlib
import json
import re
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
CODES_FILE = BASE_DIR / "codes_secrets_dac.json"
APP_JS_FILE = BASE_DIR / "public" / "app.js"
FIRESTORE_URL = (
    "https://firestore.googleapis.com/v1/projects/orp-cartographie/"
    "databases/(default)/documents/imported_files/auth_dac_hashes"
)


def compute_sha256(text: str) -> str:
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()


def load_codes() -> dict:
    if not CODES_FILE.exists():
        raise FileNotFoundError(
            f"Le fichier {CODES_FILE.name} est introuvable à la racine du projet ({BASE_DIR})."
        )
    with open(CODES_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    codes = data.get("codes", data)
    if not isinstance(codes, dict) or not codes:
        raise ValueError("Format invalide dans codes_secrets_dac.json : clé 'codes' attendue.")
    return codes


def update_app_js(hashes: dict) -> bool:
    if not APP_JS_FILE.exists():
        print(f"[ERREUR] Fichier introuvable : {APP_JS_FILE}")
        return False

    content = APP_JS_FILE.read_text(encoding="utf-8")
    js_entries = ",\n".join(f'  {json.dumps(dac, ensure_ascii=False)}: "{h}"' for dac, h in hashes.items())
    new_block = f"let DAC_PASSWORD_HASHES = {{\n{js_entries}\n}};"

    pattern = r"(?:const|let)\s+DAC_PASSWORD_HASHES\s*=\s*\{[^}]*\};"
    if re.search(pattern, content):
        updated_content = re.sub(pattern, new_block, content, count=1)
        APP_JS_FILE.write_text(updated_content, encoding="utf-8")
        return True
    else:
        print("[ATTENTION] Bloc DAC_PASSWORD_HASHES non trouvé dans public/app.js.")
        return False


def update_firebase(hashes: dict) -> bool:
    firestore_fields = {
        dac: {"stringValue": h}
        for dac, h in hashes.items()
    }
    payload = {
        "fields": {
            "type": {"stringValue": "auth_dac_hashes"},
            "hashes": {
                "mapValue": {
                    "fields": firestore_fields
                }
            }
        }
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        FIRESTORE_URL,
        data=body,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="PATCH"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return 200 <= resp.status < 300
    except Exception as e:
        print(f"[ERREUR] Mise à jour Firebase échouée : {e}")
        return False


def main():
    codes = load_codes()
    hashes = {dac: compute_sha256(code) for dac, code in codes.items()}

    print("\nCodes secrets DAC et empreintes SHA-256 générées :")
    print("-" * 78)
    for dac, code in codes.items():
        print(f"  - {dac:<42} | Code: {code:<12} | SHA-256: {hashes[dac][:16]}...")
    print("-" * 78)

    ok_js = update_app_js(hashes)
    if ok_js:
        print("[OK] Empreintes SHA-256 mises à jour dans public/app.js")

    ok_fb = update_firebase(hashes)
    if ok_fb:
        print("[OK] Empreintes synchronisées en temps réel sur Firebase Firestore (auth_dac_hashes)")


if __name__ == "__main__":
    main()
