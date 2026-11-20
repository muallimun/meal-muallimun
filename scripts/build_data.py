#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Muallimun Kur'an & Meal (meal.muallimun.net)
Faz 0 (v2): Veri Mühendisliği, Doğrulama, Pedagojik İşaretleme,
            Kotalı Şık Dengeleme ve Parçalı (Sharded) JSON Üretim Betiği

Kullanım:
    python build_data.py --output-dir public/data --questions questions.json
    python build_data.py --input-dir . --output-dir public/data --questions questions.json

Gereksinimler:
    pip install pandas openpyxl
"""

import argparse
import gzip
import hashlib
import json
import random
import re
import shutil
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import pandas as pd


SCHEMA_VERSION = 2
DEFAULT_PILOT_SURAHS = [17, 24, 31, 49]  # İsrâ, Nûr, Lokmân, Hucurât
NAMAZ_SURAHS = [1, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114]

# Kûfe (Medine Mushafı - 6236 ayet) sayımına göre YALNIZCA Hurûf-ı Mukattaa'dan oluşan
# 20 müstakil ayet (SureNo * 1000 + AyetNo).
# Not: 10:1, 11:1, 12:1, 13:1, 14:1, 15:1, 27:1, 38:1, 50:1, 68:1 ayetlerinde
# mukattaa sonrası tam anlamlı cümle/yemin devam ettiği için hariç tutulmazlar.
PURE_MUQATTAAT_IDS: Set[int] = {
    2001, 3001, 7001, 19001, 20001,
    26001, 28001, 29001, 30001, 31001, 32001,
    36001, 40001, 41001, 42001, 42002,
    43001, 44001, 45001, 46001,
}

# verseIndex 6. sütun (flags) bitmask tanımları
FLAG_MUQATTAAT = 1 << 0        # 1: Saf Hurûf-ı Mukattaa
FLAG_AR_DUP_CROSS = 1 << 1     # 2: Arapça metin başka bir surede de aynen geçiyor
FLAG_TDV_DUP_CROSS = 1 << 2    # 4: TDV meali başka bir surede de aynen geçiyor
FLAG_DIB_DUP_CROSS = 1 << 3    # 8: DİB meali başka bir surede de aynen geçiyor
FLAG_TDV_HAS_FN = 1 << 4       # 16: TDV dipnotu var
FLAG_DIB_HAS_FN = 1 << 5       # 32: DİB dipnotu var
FLAG_TDV_MERGED = 1 << 6       # 64: TDV birleşik meal grubu üyesi
FLAG_DIB_MERGED = 1 << 7       # 128: DİB birleşik meal grubu üyesi

VERSE_INDEX_FLAGS_LEGEND = {
    "muqattaat": FLAG_MUQATTAAT,
    "arDupCrossSurah": FLAG_AR_DUP_CROSS,
    "tdvDupCrossSurah": FLAG_TDV_DUP_CROSS,
    "dibDupCrossSurah": FLAG_DIB_DUP_CROSS,
    "tdvHasFootnote": FLAG_TDV_HAS_FN,
    "dibHasFootnote": FLAG_DIB_HAS_FN,
    "tdvMergedGroup": FLAG_TDV_MERGED,
    "dibMergedGroup": FLAG_DIB_MERGED,
}

AUDIO_SOURCES = {
    "hatim": {
        "id": "hatim",
        "kind": "ar",
        "label": "İshak Danış (Hatim)",
        "baseUrl": "https://dn721808.ca.archive.org/0/items/ishak-danis-ayet-ayet-hatim-arsivi/Ishak_Danis",
        "ext": "mp3",
    },
    "tdv": {
        "id": "tdv",
        "kind": "meal",
        "mealId": "m1",
        "label": "TDV Meali (Seyfullah Kartal)",
        "baseUrl": "https://dn710902.ca.archive.org/0/items/seyfullah-kartal-ayet-ayet-meal-arsivi",
        "ext": "mp3",
    },
    "dib": {
        "id": "dib",
        "kind": "meal",
        "mealId": "m2",
        "label": "DİB Yeni Meal (Mehmet Emin Ay)",
        "baseUrl": "https://dn711208.ca.archive.org/0/items/mehmet-emin-ay-ayet-ayet-meal-arsivi",
        "ext": "mp3",
    },
}

# TDV kısa dipnot ayırma için Yunus/Hud/Yusuf (10-12) özel koruma listesi
TDV_COMMENTARY_STARTERS = (
    "Bu âyet", "Bu ayet", "Âyet", "Ayet", "Bazı", "Rivayet", "Tefsir",
    "Müfessir", "Burada", "Yani", "Bak.", "Bk.", "Hz.", "Allah Teâlâ",
    "İslâm", "İslam", "Kur’an", "Kur'an", "Câhiliye", "Cahiliye",
    "Nitekim", "Zira", "Ancak", "Bundan", "Böyle", "Veya:", "«", "“"
)

# Tüm 4 şıkkın sırasını kilitleyen öncüllü ifadeler (I, II, III vb.)
ROMAN_LOCK_PATTERN = re.compile(
    r"^(yalnız\s+[IVX]+|[IVX]+(\s*,\s*[IVX]+)*\s+ve\s+[IVX]+)\.?$",
    re.IGNORECASE,
)

# Sadece son şıkta (D) sabit kalması gereken ifadeler
LAST_OPTION_PIN_PATTERN = re.compile(
    r"^(hepsi|hiçbiri|yukarıdakilerin\s+hepsi|yukarıdakilerin\s+tamamı|"
    r"bunların\s+hepsi|bunların\s+tamamı|tümü)\.?$",
    re.IGNORECASE,
)

NEGATIVE_STEM_WORDS = re.compile(
    r"\b(değildir|yanlıştır|yer almaz|sayılmamıştır|zikredilmemiştir|ulaşılamaz|bulunmaz)\b",
    re.IGNORECASE,
)

# Arapça hareke, vakıf işaretleri ve tatwîl temizleyici (sadece mükerrer karşılaştırma için)
ARABIC_DIACRITICS_RE = re.compile(
    r"[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640\u06dd\u06de\u06e9]"
)


def normalize_arabic(text: str) -> str:
    """Arapça metni NFC formuna alır ve görünmez kontrol karakterlerini temizler."""
    if not isinstance(text, str):
        return ""
    s = unicodedata.normalize("NFC", text)
    s = s.replace("\u200b", "").replace("\ufeff", "").replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip()


def normalize_arabic_key(text: str) -> str:
    """Mükerrer ayet tespiti için harekesiz ve yalın Arapça karşılaştırma anahtarı üretir."""
    s = normalize_arabic(text)
    s = ARABIC_DIACRITICS_RE.sub("", s)
    # Elif varyantlarını standartlaştır
    s = re.sub(r"[أإآٱ]", "ا", s)
    s = re.sub(r"[^\u0621-\u064a\s]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def normalize_tr_key(text: str) -> str:
    """Mükerrer meal tespiti için Türkçe noktalama/büyük-küçük harften bağımsız anahtar üretir."""
    if not text:
        return ""
    s = text.replace("İ", "i").replace("I", "ı").lower()
    s = s.replace("â", "a").replace("î", "i").replace("û", "u")
    s = re.sub(r"[^\w\s]", " ", s, flags=re.UNICODE)
    return re.sub(r"\s+", " ", s).strip()


def clean_plain_text(val: Any) -> Optional[str]:
    """Excel hücrelerindeki NaN/boş değerleri None'a çevirir, metni temizler."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    s = str(val).replace("\ufeff", "").replace("\xa0", " ").strip()
    if not s or s.lower() == "nan":
        return None
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in s.splitlines()]
    cleaned = "\n".join(ln for ln in lines if ln)
    return cleaned or None


def pad3(n: int) -> str:
    return f"{int(n):03d}"


def pad6(sure: int, ayet: int) -> str:
    return f"{int(sure):03d}{int(ayet):03d}"


def is_mekki_type(val: str) -> bool:
    v = (val or "").lower().replace("î", "i").replace("ı", "i")
    return "mekk" in v


def is_medeni_type(val: str) -> bool:
    v = (val or "").lower().replace("î", "i").replace("ı", "i")
    return "meden" in v


def find_preview_duplicate(text: str, min_anchor: int = 20) -> Optional[Tuple[int, int]]:
    """
    Kaynak Excel'deki HTML kazıma kaynaklı 'kısa_önizleme... tam_dipnot'
    tekrarını yakalar.
    """
    for md in re.finditer(r"\.\.\.\s+", text):
        after = text[md.end():]
        if len(after) < min_anchor:
            continue
        anchor = after[:min_anchor]
        idx = text.find(anchor, 0, md.start())
        if idx != -1:
            return idx, md.end()
    return None


def parse_tdv_meal(raw_text: str, sure_no: int) -> Tuple[str, List[str]]:
    """Diyanet Vakfı Meali hücresinden temiz meal metni ile varsa tefsir/dipnotu ayırır."""
    s = str(raw_text).replace("\ufeff", "").strip()
    if not s:
        return "", []

    dup = find_preview_duplicate(s, min_anchor=22)
    if dup:
        fn_start, full_start = dup
        main_part = s[:fn_start].replace("\xa0", " ").strip()
        note_part = s[full_start:].replace("\xa0", " ").strip()
        main_part = re.sub(r"\s+", " ", main_part)
        note_part = re.sub(r"[ \t]+", " ", note_part)
        return main_part, ([note_part] if note_part else [])

    if "\xa0" in s:
        for m in re.finditer(r"\xa0+", s):
            before = s[:m.start()].rstrip()
            after = s[m.end():].lstrip()
            if not before or not after:
                continue

            ends_sentence = before[-1] in ".!?»”\")"
            if sure_no in (10, 11, 12):
                is_commentary = ends_sentence and after.startswith(TDV_COMMENTARY_STARTERS)
            else:
                starts_upper_or_quote = bool(re.match(r"^[A-ZÇĞİÖŞÜÂÎÛ0-9«“\(]", after))
                is_commentary = (ends_sentence and starts_upper_or_quote) or (
                    after.startswith(TDV_COMMENTARY_STARTERS)
                )

            if is_commentary:
                main_part = re.sub(r"\s+", " ", before.replace("\xa0", " ")).strip()
                note_part = re.sub(r"[ \t]+", " ", after.replace("\xa0", " ")).strip()
                return main_part, ([note_part] if note_part else [])

    clean = re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()
    return clean, []


def parse_dib_meal(raw_text: str) -> Tuple[str, List[str]]:
    """Diyanet İşleri Meali (Yeni) hücresinden temiz meal ve dipnot listesini ayırır."""
    s = str(raw_text).replace("\ufeff", "").strip()
    if not s:
        return "", []

    main_part = s
    raw_note = ""

    dup = find_preview_duplicate(s, min_anchor=20)
    if dup:
        fn_start, full_start = dup
        main_part = s[:fn_start].strip()
        raw_note = s[full_start:].strip()
    elif re.search(r"\[\d+\]", s):
        split_idx = None
        for cand in re.finditer(r"([\.\!\?\]۩]+)\s*([A-ZÇĞİÖŞÜÂÎÛ0-9“«\(])", s):
            pos = cand.start()
            sep = cand.group(1)
            if cand.end(1) < cand.start(2) and "۩" not in sep:
                continue
            prefix = s[max(0, pos - 6):pos + 1]
            if re.search(r"(Hz|Bk|bk|Dr|vs|vb|Prof|s\.a\.s|r\.a|a\.s)\.$", prefix):
                continue
            if pos < 8:
                continue
            if re.search(r"\[\d+\]", s[:cand.start(2)]):
                split_idx = cand.start(2)
                break
        if split_idx is not None:
            main_part = s[:split_idx].strip()
            raw_note = s[split_idx:].strip()

    clean_main = re.sub(r"\[\d+\]", "", main_part)
    clean_main = re.sub(r"\s+([,.;:!?])", r"\1", clean_main)
    clean_main = re.sub(r"\s+", " ", clean_main.replace("\xa0", " ")).strip()

    notes: List[str] = []
    if raw_note:
        for line in raw_note.replace("\xa0", " ").splitlines():
            ln = re.sub(r"[ \t]+", " ", line).strip()
            if ln:
                notes.append(ln)

    return clean_main, notes


def detect_merged_groups(rows: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int]:
    """
    Aynı sure içinde ardışık satırlarda birebir aynı meal metnine sahip
    birleşik ayetleri tespit eder ve her ilgili ayete `mg: [startAyet, endAyet]` ekler.
    """
    group_count = 0
    i = 0
    n = len(rows)
    while i < n:
        j = i + 1
        base_text = rows[i]["t"]
        while j < n and rows[j]["t"] == base_text and base_text != "":
            j += 1
        if j - i > 1:
            group_count += 1
            start_a = rows[i]["a"]
            end_a = rows[j - 1]["a"]
            for k in range(i, j):
                rows[k]["mg"] = [start_a, end_a]
        i = j
    return rows, group_count


def extract_json_arrays_from_text(raw: str) -> List[Dict[str, Any]]:
    """Tek JSON dosyasını veya peş peşe eklenmiş çoklu JSON dizilerini ayrıştırır."""
    raw = raw.lstrip("\ufeff").strip()
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict) and "questions" in parsed:
            return parsed["questions"]
    except json.JSONDecodeError:
        pass

    cleaned = re.sub(r"```(?:json)?", "", raw, flags=re.IGNORECASE)
    decoder = json.JSONDecoder()
    items: List[Dict[str, Any]] = []
    idx = 0
    length = len(cleaned)
    while idx < length:
        nxt = cleaned.find("[", idx)
        if nxt == -1:
            break
        try:
            obj, end = decoder.raw_decode(cleaned, nxt)
            if isinstance(obj, list):
                items.extend(obj)
            idx = end
        except json.JSONDecodeError:
            idx = nxt + 1
    return items


def balance_surah_questions(
    questions: List[Dict[str, Any]],
    global_counts: Counter,
    rng: random.Random,
) -> Dict[str, Any]:
    """
    Bir suredeki soruların doğru cevap indekslerini (0..3) telafi edici kota
    yöntemiyle dengeler:
      - lockOrder=True sorulardaki şık sırasına dokunmaz ama onların doldurduğu
        kotaları hesaba katarak serbest soruları eksik şıklara yönlendirir.
      - Sadece 'Hepsi/Hiçbiri' içeren (öncüllü olmayan) sorularda o şıkkı
        D'de (3) sabitler, kalan 3 şıkkı kota dengesine göre yerleştirir.
      - Ardışık 3 kez aynı şıkkın gelmesini mümkün olduğunca önler (Max-Run <= 2).
    """
    n = len(questions)
    if n == 0:
        return {"locked": 0, "pinnedLast": 0, "maxRun": 0}

    # Sure içi hedef kotalar (kalan +1'ler global toplamda en az olan şıklara verilir)
    base_q, rem = divmod(n, 4)
    targets = {i: base_q for i in range(4)}
    order_by_global = sorted(range(4), key=lambda k: (global_counts[k], rng.random()))
    for k in order_by_global[:rem]:
        targets[k] += 1

    # 1. Geçiş: Sabit (lockOrder=True) ve D-kilitli ("Hepsi" doğru cevap ise) soruları say
    surah_counts = Counter()
    locked_count = 0
    pinned_last_count = 0
    meta_modes: List[Tuple[str, Optional[int]]] = []  # ("locked"|"pin_last"|"free", pinned_orig_idx)

    for q in questions:
        opts = q["options"]
        ans = q["answerIndex"]
        if q["lockOrder"]:
            meta_modes.append(("locked", None))
            surah_counts[ans] += 1
            locked_count += 1
        else:
            pin_indices = [i for i, o in enumerate(opts) if LAST_OPTION_PIN_PATTERN.match(o)]
            if len(pin_indices) == 1:
                p_idx = pin_indices[0]
                pinned_last_count += 1
                meta_modes.append(("pin_last", p_idx))
                if ans == p_idx:
                    # Doğru cevap "Hepsi/Hiçbiri" ise mecburen indeks 3'e (D) oturur
                    surah_counts[3] += 1
            else:
                meta_modes.append(("free", None))

    # 2. Geçiş: Serbest ve kısmi-kilitli soruları eksik kotalara ve ardışıklık kuralına göre yerleştir
    assigned_history: List[int] = []

    for q, (mode, p_idx) in zip(questions, meta_modes):
        opts = list(q["options"])
        ans = q["answerIndex"]

        if mode == "locked":
            assigned_history.append(ans)
            continue

        if mode == "pin_last" and p_idx is not None:
            pinned_text = opts[p_idx]
            others = [(i, o) for i, o in enumerate(opts) if i != p_idx]

            if ans == p_idx:
                # Doğru cevap D'de sabit; diğer 3 çeldiriciyi 0,1,2'de karıştır
                rng.shuffle(others)
                q["options"] = [o for _, o in others] + [pinned_text]
                q["answerIndex"] = 3
                assigned_history.append(3)
            else:
                # Doğru cevap 0, 1, 2 yuvalarından kotası en açık olana gider
                allowed = [0, 1, 2]
                target_slot = _pick_balanced_slot(allowed, targets, surah_counts, global_counts, assigned_history, rng)
                correct_text = opts[ans]
                distractors = [o for i, o in others if i != ans]
                rng.shuffle(distractors)

                new_opts = ["", "", "", pinned_text]
                new_opts[target_slot] = correct_text
                d_iter = iter(distractors)
                for s_idx in allowed:
                    if s_idx != target_slot:
                        new_opts[s_idx] = next(d_iter)

                q["options"] = new_opts
                q["answerIndex"] = target_slot
                surah_counts[target_slot] += 1
                assigned_history.append(target_slot)
            continue

        # Tamamen serbest soru: 0, 1, 2, 3 yuvalarından en dengeli olanı seç
        allowed = [0, 1, 2, 3]
        target_slot = _pick_balanced_slot(allowed, targets, surah_counts, global_counts, assigned_history, rng)
        correct_text = opts[ans]
        distractors = [o for i, o in enumerate(opts) if i != ans]
        rng.shuffle(distractors)

        new_opts = ["", "", "", ""]
        new_opts[target_slot] = correct_text
        d_iter = iter(distractors)
        for s_idx in allowed:
            if s_idx != target_slot:
                new_opts[s_idx] = next(d_iter)

        q["options"] = new_opts
        q["answerIndex"] = target_slot
        surah_counts[target_slot] += 1
        assigned_history.append(target_slot)

    # Global sayaçları güncelle ve en uzun ardışık aynı şık serisini ölç
    for a in assigned_history:
        global_counts[a] += 1

    max_run = 0
    cur_run = 0
    prev = None
    for a in assigned_history:
        if a == prev:
            cur_run += 1
        else:
            cur_run = 1
            prev = a
        if cur_run > max_run:
            max_run = cur_run

    return {
        "locked": locked_count,
        "pinnedLast": pinned_last_count,
        "maxRun": max_run,
        "distribution": dict(sorted(Counter(assigned_history).items())),
    }


def _pick_balanced_slot(
    allowed: List[int],
    targets: Dict[int, int],
    surah_counts: Counter,
    global_counts: Counter,
    history: List[int],
    rng: random.Random,
) -> int:
    """Kotası en eksik şıkkı seçer; son 2 soru aynıysa o şıkkı mümkünse eler."""
    avoid = None
    if len(history) >= 2 and history[-1] == history[-2]:
        avoid = history[-1]

    candidates = [s for s in allowed if s != avoid] if avoid in allowed and len(allowed) > 1 else list(allowed)

    # En yüksek sure içi açık (target - current) -> ardından en düşük global toplam -> rastgele kırılım
    def score(slot: int) -> Tuple[int, int, float]:
        deficit = targets[slot] - surah_counts[slot]
        return (deficit, -global_counts[slot], rng.random())

    best_slot = max(candidates, key=score)
    # Eğer seçilen aday çok fazla aşıyorsa ama avoid edilenin ciddi açığı varsa yine de en açık olanı koru
    return best_slot


def load_and_validate_questions(
    questions_path: Path,
    surah_max_ayah: Dict[int, int],
    surah_cuz_map: Dict[int, List[int]],
    balance_answers: bool = True,
    seed: int = 2026,
) -> Tuple[Dict[int, List[Dict[str, Any]]], List[Dict[str, Any]], Dict[str, Any]]:
    """Soru bankasını okur, doğrular, kotalı dengeler ve sure bazlı parçalar."""
    raw_items: List[Dict[str, Any]] = []
    if questions_path.is_dir():
        for p in sorted(questions_path.iterdir()):
            if p.suffix.lower() in (".json", ".txt"):
                raw_items.extend(extract_json_arrays_from_text(p.read_text(encoding="utf-8-sig")))
    elif questions_path.is_file():
        raw_items = extract_json_arrays_from_text(questions_path.read_text(encoding="utf-8-sig"))
    else:
        return {}, [], {"status": "not_found", "path": str(questions_path)}

    rng = random.Random(seed)
    errors: List[str] = []
    warnings: List[str] = []
    seen_ids: Set[str] = set()
    seen_stems: Set[str] = set()
    by_surah: Dict[int, List[Dict[str, Any]]] = defaultdict(list)

    ans_before = Counter()
    locked_before = Counter()
    bold_fixed = 0
    lock_fixed = 0

    for idx, q in enumerate(raw_items):
        qid = str(q.get("id", f"Q_AUTO_{idx+1:04d}")).strip()
        if qid in seen_ids:
            errors.append(f"Mükerrer soru ID: {qid}")
            continue
        seen_ids.add(qid)

        surah = int(q.get("surah", 0))
        cuz = int(q.get("cuz", 0))
        options = [str(o).strip() for o in q.get("options", [])]
        answer_idx = q.get("answerIndex")
        stem = str(q.get("stem", "")).strip()
        explanation = str(q.get("explanation", "")).strip()
        premises = [str(p).strip() for p in q.get("premises", []) if str(p).strip()]
        q_type = str(q.get("type", "mcq")).strip()
        scope = str(q.get("scope", "ayah")).strip()
        meal_basis = str(q.get("mealBasis", "tdv")).strip()
        difficulty = int(q.get("difficulty", 2))
        lock_order = bool(q.get("lockOrder", False))
        refs = q.get("refs", [])
        source_ref = str(q.get("sourceRef", "unknown")).strip()
        verification_status = str(q.get("verificationStatus", "pending")).strip()

        if surah not in surah_max_ayah:
            errors.append(f"{qid}: Geçersiz sure numarası ({surah})")
            continue
        if len(options) != 4:
            errors.append(f"{qid}: Seçenek sayısı 4 değil ({len(options)})")
            continue
        if len(set(o.lower() for o in options)) != 4:
            errors.append(f"{qid}: Tekrarlayan seçenek var")
            continue
        if not isinstance(answer_idx, int) or not (0 <= answer_idx < 4):
            errors.append(f"{qid}: Geçersiz answerIndex ({answer_idx})")
            continue
        if not refs:
            errors.append(f"{qid}: refs alanı boş")
            continue

        valid_refs = []
        ref_error = False
        for r in refs:
            rs = int(r.get("sure", surah))
            rf = int(r.get("from", 1))
            rt = int(r.get("to", rf))
            max_a = surah_max_ayah.get(rs, 0)
            if max_a == 0 or rf < 1 or rt > max_a or rf > rt:
                errors.append(f"{qid}: Geçersiz ayet aralığı {r} (max={max_a})")
                ref_error = True
                break
            valid_refs.append({"sure": rs, "from": rf, "to": rt})
        if ref_error:
            continue

        if cuz not in surah_cuz_map.get(surah, []):
            warnings.append(f"{qid}: Cüz ({cuz}) surenin cüzleriyle ({surah_cuz_map.get(surah)}) uyuşmuyor")

        norm_stem = re.sub(r"\W+", " ", stem.lower()).strip()
        if norm_stem in seen_stems:
            warnings.append(f"{qid}: Benzer/tekrar eden soru kökü atlandı")
            continue
        seen_stems.add(norm_stem)

        # Öncüllü (I, II, III) sorularda tam sırayı kilitle;
        # Sadece 'Hepsi/Hiçbiri' olanlarda tüm şıkları kilitleme (D-sabitleme devralır).
        if not lock_order and any(ROMAN_LOCK_PATTERN.match(o) for o in options):
            lock_order = True
            lock_fixed += 1

        if "**" not in stem and not stem.startswith('"'):
            new_stem = NEGATIVE_STEM_WORDS.sub(r"**\1**", stem)
            if new_stem != stem:
                stem = new_stem
                bold_fixed += 1

        ans_before[answer_idx] += 1
        if lock_order:
            locked_before[answer_idx] += 1

        uid_hash = hashlib.sha1(f"{surah}|{valid_refs}|{norm_stem}".encode("utf-8")).hexdigest()[:10]

        clean_q = {
            "id": qid,
            "uid": uid_hash,
            "surah": surah,
            "cuz": cuz,
            "scope": scope,
            "refs": valid_refs,
            "mealBasis": meal_basis,
            "type": q_type,
            "difficulty": difficulty,
            "premises": premises,
            "stem": stem,
            "options": options,
            "answerIndex": answer_idx,
            "lockOrder": lock_order,
            "explanation": explanation,
            "sourceRef": source_ref,
            "verificationStatus": verification_status,
        }
        by_surah[surah].append(clean_q)

    # 2. Aşama: Sure bazlı + global telafi edici şık dengeleme
    global_counts = Counter()
    per_surah_balance: Dict[str, Any] = {}
    ans_after = Counter()
    q_index: List[Dict[str, Any]] = []

    for s_no in sorted(by_surah.keys()):
        q_list = by_surah[s_no]
        if balance_answers:
            stats = balance_surah_questions(q_list, global_counts, rng)
            per_surah_balance[str(s_no)] = stats
        else:
            dist = Counter(q["answerIndex"] for q in q_list)
            per_surah_balance[str(s_no)] = {"distribution": dict(sorted(dist.items()))}

        for q in q_list:
            ans_after[q["answerIndex"]] += 1
            q_index.append({
                "id": q["id"],
                "surah": q["surah"],
                "cuz": q["cuz"],
                "scope": q["scope"],
                "refs": [[r["sure"], r["from"], r["to"]] for r in q["refs"]],
                "mealBasis": q["mealBasis"],
                "type": q["type"],
                "difficulty": q["difficulty"],
                "status": q["verificationStatus"],
            })

    report = {
        "totalInput": len(raw_items),
        "totalValid": len(q_index),
        "bySurah": {str(k): len(v) for k, v in sorted(by_surah.items())},
        "lockedQuestionsTotal": sum(locked_before.values()),
        "lockedAnswerDistribution": dict(sorted(locked_before.items())),
        "answerDistributionBefore": dict(sorted(ans_before.items())),
        "answerDistributionAfter": dict(sorted(ans_after.items())),
        "perSurahBalance": per_surah_balance,
        "autoFixes": {
            "boldNegativeStems": bold_fixed,
            "lockOrderEnabled": lock_fixed,
        },
        "errorCount": len(errors),
        "warningCount": len(warnings),
        "errors": errors[:50],
        "warnings": warnings[:50],
    }
    return dict(by_surah), q_index, report


def safe_clean_output_dir(out_dir: Path) -> None:
    """Yalnızca bu betiğin ürettiği bilinen alt klasör ve JSON dosyalarını temizler."""
    if not out_dir.exists():
        return
    for sub in ("ar", "m1", "m2", "w", "q"):
        sub_path = out_dir / sub
        if sub_path.is_dir():
            shutil.rmtree(sub_path)
    for fname in ("meta.json", "manifest.json", "quality_report.json"):
        fpath = out_dir / fname
        if fpath.is_file():
            fpath.unlink()


def write_json(path: Path, data: Any, minify: bool = True) -> Tuple[int, int]:
    """JSON dosyasını UTF-8 (BOM'suz) yazar; (ham_boyut, gzip_boyut) döner."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if minify:
        text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    else:
        text = json.dumps(data, ensure_ascii=False, indent=2)
    raw_bytes = text.encode("utf-8")
    path.write_bytes(raw_bytes)
    gz_bytes = gzip.compress(raw_bytes, compresslevel=6)
    return len(raw_bytes), len(gz_bytes)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Muallimun Kur'an & Meal Veri Dönüştürme, Pedagojik Analiz ve Doğrulama Betiği (v2)"
    )
    parser.add_argument("--input-dir", default=".", help="Excel dosyalarının bulunduğu klasör")
    parser.add_argument("--output-dir", default="public/data", help="Üretilecek JSON veri klasörü")
    parser.add_argument("--questions", default="questions.json", help="Soru JSON dosyası veya raw_questions klasörü")
    parser.add_argument("--no-balance", action="store_true", help="Kotalı şık dengelemeyi devre dışı bırak")
    parser.add_argument("--no-clean", action="store_true", help="Önceki çıktı dosyalarını temizlemeden üzerine yaz")
    parser.add_argument("--seed", type=int, default=2026, help="Deterministik rastgelelik tohumu")
    parser.add_argument("--version", default=datetime.now(timezone.utc).strftime("%Y.%m.%d.1"), help="Veri sürüm etiketi")
    args = parser.parse_args()

    in_dir = Path(args.input_dir)
    out_dir = Path(args.output_dir)
    q_path = Path(args.questions)
    if not q_path.is_absolute() and not q_path.exists():
        q_path = in_dir / args.questions

    ayet_xlsx = in_dir / "ayet_meal.xlsx"
    kelime_xlsx = in_dir / "kelimeler.xlsx"
    sure_xlsx = in_dir / "sure_bilgileri.xlsx"

    for req in (ayet_xlsx, kelime_xlsx, sure_xlsx):
        if not req.exists():
            print(f"[HATA] Gerekli dosya bulunamadı: {req}", file=sys.stderr)
            return 1

    if not args.no_clean:
        safe_clean_output_dir(out_dir)

    print("1/6 Excel kaynakları okunuyor ve bütünlük doğrulanıyor...")
    df_am = pd.read_excel(ayet_xlsx)
    df_kel = pd.read_excel(kelime_xlsx)
    df_sur = pd.read_excel(sure_xlsx)

    df_am.columns = [str(c).replace("\xa0", " ").strip() for c in df_am.columns]
    df_kel.columns = [str(c).replace("\xa0", " ").strip() for c in df_kel.columns]
    df_sur.columns = [str(c).replace("\xa0", " ").strip() for c in df_sur.columns]

    assert len(df_am) == 6236, f"ayet_meal.xlsx satır sayısı 6236 olmalı, bulunan: {len(df_am)}"
    assert len(df_kel) == 6236, f"kelimeler.xlsx satır sayısı 6236 olmalı, bulunan: {len(df_kel)}"
    assert len(df_sur) == 114, f"sure_bilgileri.xlsx satır sayısı 114 olmalı, bulunan: {len(df_sur)}"

    for col in ("ID", "SureNo", "AyetNo", "Cuz", "Sayfa"):
        df_am[col] = df_am[col].astype(int)
    df_kel["ID"] = df_kel["ID"].astype(int)

    expected_ids = df_am["SureNo"] * 1000 + df_am["AyetNo"]
    assert (df_am["ID"] == expected_ids).all(), "ID == SureNo*1000 + AyetNo kuralı bozulmuş!"
    assert df_am["ID"].is_unique, "ayet_meal.xlsx içinde mükerrer ID var!"
    assert (df_am["ID"].values == df_kel["ID"].values).all(), "ayet_meal ve kelimeler ID sıralaması uyuşmuyor!"

    sure_meta_map: Dict[int, Dict[str, Any]] = {}
    for _, row in df_sur.iterrows():
        s_no = int(row["Kur'an Sırası"])
        sure_meta_map[s_no] = {
            "no": s_no,
            "nuzulSirasi": int(row["Nüzul Sırası"]),
            "nameTr": clean_plain_text(row["Sure Adı TR"]) or "",
            "nameAr": normalize_arabic(str(row["Sure Adı AR"])),
            "type": clean_plain_text(row["mekki-medeni"]) or "",
            "ayahCount": int(row["Ayet Sayısı"]),
            "hakkinda": clean_plain_text(row["Hakkinda"]),
            "nuzul": clean_plain_text(row["Nuzul"]),
            "konusu": clean_plain_text(row["Konusu"]),
        }

    am_counts = df_am.groupby("SureNo")["AyetNo"].count().to_dict()
    for s_no, cnt in am_counts.items():
        assert sure_meta_map[s_no]["ayahCount"] == cnt, f"Sure {s_no} ayet sayısı uyuşmuyor!"

    audio_mismatches = 0
    for col, key in [
        ("Kuran_Hatim", "hatim"),
        ("TDV_meali_seyfullah_kartal", "tdv"),
        ("Dib_Meali_m_emin_ay", "dib"),
    ]:
        base = AUDIO_SOURCES[key]["baseUrl"]
        expected_urls = df_am.apply(lambda r: f"{base}/{pad6(r['SureNo'], r['AyetNo'])}.mp3", axis=1)
        audio_mismatches += int((df_am[col].astype(str).str.strip() != expected_urls).sum())
    assert audio_mismatches == 0, f"Ses URL kalıbıyla uyuşmayan {audio_mismatches} satır tespit edildi!"

    print("2/6 Ayetler, çift meal, dipnotlar ve kelime verileri bellekte ayrıştırılıyor...")
    kelime_by_id = dict(zip(df_kel["ID"].tolist(), df_kel["Kelime_Verisi"].tolist()))

    # 1. Geçiş: Tüm surelerin ham yapısını kur + birleşik grupları tespit et
    surah_bundles: Dict[int, Dict[str, Any]] = {}
    tdv_fn_count = 0
    dib_fn_count = 0
    tdv_merged_groups = 0
    dib_merged_groups = 0
    total_words = 0

    surah_max_ayah: Dict[int, int] = {}
    surah_cuz_map: Dict[int, List[int]] = {}

    # Global mükerrer takibi (birleşik grup içi tekrarları hariç tutarak)
    ar_unit_occ: Dict[str, Set[Tuple[int, int]]] = defaultdict(set)      # key -> {(sure, ayet)}
    tdv_unit_occ: Dict[str, Set[Tuple[int, int, int]]] = defaultdict(set)  # key -> {(sure, startA, endA)}
    dib_unit_occ: Dict[str, Set[Tuple[int, int, int]]] = defaultdict(set)

    for s_no, grp in df_am.groupby("SureNo", sort=True):
        s_no = int(s_no)
        ar_rows: List[Dict[str, Any]] = []
        m1_rows: List[Dict[str, Any]] = []
        m2_rows: List[Dict[str, Any]] = []
        w_map: Dict[str, List[List[str]]] = {}

        cuz_set = sorted(int(c) for c in grp["Cuz"].unique())
        pages = sorted(int(p) for p in grp["Sayfa"].unique())
        surah_max_ayah[s_no] = int(grp["AyetNo"].max())
        surah_cuz_map[s_no] = cuz_set

        s_tdv_fn = 0
        s_dib_fn = 0

        for _, r in grp.iterrows():
            vid = int(r["ID"])
            a_no = int(r["AyetNo"])
            cuz = int(r["Cuz"])
            sayfa = int(r["Sayfa"])

            raw_words = json.loads(kelime_by_id[vid])
            tuples = [[normalize_arabic(w["arapca"]), str(w["anlam"]).strip()] for w in raw_words]
            total_words += len(tuples)
            w_map[str(a_no)] = tuples

            ar_text = normalize_arabic(str(r["Arapca_Metin"]))
            ar_row: Dict[str, Any] = {
                "id": vid,
                "a": a_no,
                "c": cuz,
                "p": sayfa,
                "t": ar_text,
                "wc": len(tuples),
            }
            if vid in PURE_MUQATTAAT_IDS:
                ar_row["mq"] = 1
            ar_rows.append(ar_row)

            ar_key = normalize_arabic_key(ar_text)
            if ar_key:
                ar_unit_occ[ar_key].add((s_no, a_no))

            tdv_clean, tdv_notes = parse_tdv_meal(r["Diyanet Vakfı Meali"], s_no)
            if tdv_notes:
                tdv_fn_count += 1
                s_tdv_fn += 1
            m1_item: Dict[str, Any] = {"id": vid, "a": a_no, "t": tdv_clean, "len": len(tdv_clean)}
            if tdv_notes:
                m1_item["fn"] = tdv_notes
            m1_rows.append(m1_item)

            dib_clean, dib_notes = parse_dib_meal(r["Diyanet İşleri Meali (Yeni)"])
            if dib_notes:
                dib_fn_count += 1
                s_dib_fn += 1
            m2_item: Dict[str, Any] = {"id": vid, "a": a_no, "t": dib_clean, "len": len(dib_clean)}
            if dib_notes:
                m2_item["fn"] = dib_notes
            m2_rows.append(m2_item)

        m1_rows, g1 = detect_merged_groups(m1_rows)
        m2_rows, g2 = detect_merged_groups(m2_rows)
        tdv_merged_groups += g1
        dib_merged_groups += g2

        # Birleşik grupları tek birim kabul ederek meal tekrarlarını kaydet
        for row in m1_rows:
            k = normalize_tr_key(row["t"])
            if k:
                mg = row.get("mg")
                unit = (s_no, mg[0], mg[1]) if mg else (s_no, row["a"], row["a"])
                tdv_unit_occ[k].add(unit)

        for row in m2_rows:
            k = normalize_tr_key(row["t"])
            if k:
                mg = row.get("mg")
                unit = (s_no, mg[0], mg[1]) if mg else (s_no, row["a"], row["a"])
                dib_unit_occ[k].add(unit)

        surah_bundles[s_no] = {
            "ar": ar_rows,
            "m1": m1_rows,
            "m2": m2_rows,
            "w": w_map,
            "cuzs": cuz_set,
            "pages": pages,
            "shortNameTr": clean_plain_text(grp["SureAdi_TR"].iloc[0]) or sure_meta_map[s_no]["nameTr"],
            "firstId": int(grp["ID"].iloc[0]),
            "lastId": int(grp["ID"].iloc[-1]),
            "tdvFnCount": s_tdv_fn,
            "dibFnCount": s_dib_fn,
        }

    print("3/6 Pedagojik mükerrer bayrakları işleniyor ve sure parçaları yazılıyor...")
    total_raw_bytes = 0
    total_gz_bytes = 0

    # Kompakt global indeks: [id, sureNo, ayetNo, cuz, sayfa, flags]
    verse_index: List[List[int]] = []
    surahs_list: List[Dict[str, Any]] = []

    cuz_surahs: Dict[int, set] = defaultdict(set)
    cuz_surah_counts: Dict[int, Counter] = defaultdict(Counter)
    cuz_ayah_counts: Counter = Counter()
    cuz_first: Dict[int, Tuple[int, int, int]] = {}  # cuz -> (id, s, a)
    cuz_last: Dict[int, Tuple[int, int, int]] = {}

    ped_stats = {
        "pureMuqattaat": 0,
        "arDupAny": 0,
        "arDupCrossSurah": 0,
        "tdvDupAny": 0,
        "tdvDupCrossSurah": 0,
        "dibDupAny": 0,
        "dibDupCrossSurah": 0,
    }

    for s_no in range(1, 115):
        b = surah_bundles[s_no]
        ar_rows = b["ar"]
        m1_rows = b["m1"]
        m2_rows = b["m2"]
        w_map = b["w"]

        stem_eligible_tdv = 0
        stem_eligible_dib = 0

        for ar_r, m1_r, m2_r in zip(ar_rows, m1_rows, m2_rows):
            vid = ar_r["id"]
            a_no = ar_r["a"]
            cuz = ar_r["c"]
            sayfa = ar_r["p"]

            flags = 0

            # Saf Hurûf-ı Mukattaa
            if ar_r.get("mq") == 1:
                flags |= FLAG_MUQATTAAT
                ped_stats["pureMuqattaat"] += 1

            # Arapça tekrar kontrolü
            ar_key = normalize_arabic_key(ar_r["t"])
            ar_occs = ar_unit_occ.get(ar_key, set())
            if len(ar_occs) > 1:
                ar_r["dup"] = 1
                ped_stats["arDupAny"] += 1
                if len({o[0] for o in ar_occs}) > 1:
                    ar_r["dupX"] = 1
                    flags |= FLAG_AR_DUP_CROSS
                    ped_stats["arDupCrossSurah"] += 1

            # TDV tekrar / dipnot / birleşik grup kontrolü
            tdv_key = normalize_tr_key(m1_r["t"])
            tdv_occs = tdv_unit_occ.get(tdv_key, set())
            if len(tdv_occs) > 1:
                m1_r["dup"] = 1
                ped_stats["tdvDupAny"] += 1
                if len({o[0] for o in tdv_occs}) > 1:
                    m1_r["dupX"] = 1
                    flags |= FLAG_TDV_DUP_CROSS
                    ped_stats["tdvDupCrossSurah"] += 1
            if "fn" in m1_r:
                flags |= FLAG_TDV_HAS_FN
            if "mg" in m1_r:
                flags |= FLAG_TDV_MERGED

            # DİB tekrar / dipnot / birleşik grup kontrolü
            dib_key = normalize_tr_key(m2_r["t"])
            dib_occs = dib_unit_occ.get(dib_key, set())
            if len(dib_occs) > 1:
                m2_r["dup"] = 1
                ped_stats["dibDupAny"] += 1
                if len({o[0] for o in dib_occs}) > 1:
                    m2_r["dupX"] = 1
                    flags |= FLAG_DIB_DUP_CROSS
                    ped_stats["dibDupCrossSurah"] += 1
            if "fn" in m2_r:
                flags |= FLAG_DIB_HAS_FN
            if "mg" in m2_r:
                flags |= FLAG_DIB_MERGED

            # Dinamik soru kökü olmaya uygunluk (saf mukattaa değil + sureler arası tekrar yok)
            if not (flags & (FLAG_MUQATTAAT | FLAG_TDV_DUP_CROSS)):
                stem_eligible_tdv += 1
            if not (flags & (FLAG_MUQATTAAT | FLAG_DIB_DUP_CROSS)):
                stem_eligible_dib += 1

            verse_index.append([vid, s_no, a_no, cuz, sayfa, flags])

            cuz_surahs[cuz].add(s_no)
            cuz_surah_counts[cuz][s_no] += 1
            cuz_ayah_counts[cuz] += 1
            if cuz not in cuz_first:
                cuz_first[cuz] = (vid, s_no, a_no)
            cuz_last[cuz] = (vid, s_no, a_no)

        s_code = f"s{pad3(s_no)}"
        for sub, payload in [
            ("ar", {"s": s_no, "verses": ar_rows}),
            ("m1", {"s": s_no, "meal": "tdv", "verses": m1_rows}),
            ("m2", {"s": s_no, "meal": "dib", "verses": m2_rows}),
            ("w", {"s": s_no, "words": w_map}),
        ]:
            rb, gb = write_json(out_dir / sub / f"{s_code}.json", payload, minify=True)
            total_raw_bytes += rb
            total_gz_bytes += gb

        s_info = dict(sure_meta_map[s_no])
        s_info["shortNameTr"] = b["shortNameTr"]
        s_info["cuzs"] = b["cuzs"]
        s_info["pageStart"] = b["pages"][0]
        s_info["pageEnd"] = b["pages"][-1]
        s_info["firstId"] = b["firstId"]
        s_info["lastId"] = b["lastId"]
        s_info["tdvFootnoteCount"] = b["tdvFnCount"]
        s_info["dibFootnoteCount"] = b["dibFnCount"]
        s_info["stemEligible"] = {"tdv": stem_eligible_tdv, "dib": stem_eligible_dib}
        surahs_list.append(s_info)

    print("4/6 Soru bankası doğrulanıyor ve kotalı şık dengeleme uygulanıyor...")
    q_by_surah, q_index, q_report = load_and_validate_questions(
        q_path,
        surah_max_ayah=surah_max_ayah,
        surah_cuz_map=surah_cuz_map,
        balance_answers=(not args.no_balance),
        seed=args.seed,
    )

    question_surahs = sorted(q_by_surah.keys())
    for s_no in question_surahs:
        rb, gb = write_json(
            out_dir / "q" / f"s{pad3(s_no)}.json",
            {"s": s_no, "questions": q_by_surah[s_no]},
            minify=True,
        )
        total_raw_bytes += rb
        total_gz_bytes += gb

    rb, gb = write_json(
        out_dir / "q" / "index.json",
        {"version": args.version, "availableSurahs": question_surahs, "items": q_index},
        minify=True,
    )
    total_raw_bytes += rb
    total_gz_bytes += gb

    # Sure meta kayıtlarına hazır soru sayısını işle
    q_count_by_surah = {s: len(v) for s, v in q_by_surah.items()}
    for s_info in surahs_list:
        s_info["questionCount"] = q_count_by_surah.get(s_info["no"], 0)

    print("5/6 Zenginleştirilmiş meta.json (cüz haritası + hazır paketler + bayrak indeksi) yazılıyor...")
    juz_list = []
    for c in range(1, 31):
        fid, fs, fa = cuz_first[c]
        lid, ls, la = cuz_last[c]
        juz_list.append({
            "no": c,
            "ayahCount": int(cuz_ayah_counts[c]),
            "surahs": sorted(cuz_surahs[c]),
            "surahCounts": {str(k): int(v) for k, v in sorted(cuz_surah_counts[c].items())},
            "firstId": fid,
            "lastId": lid,
            "start": {"s": fs, "a": fa},
            "end": {"s": ls, "a": la},
        })

    mekki_surahs = [s["no"] for s in surahs_list if is_mekki_type(s["type"])]
    medeni_surahs = [s["no"] for s in surahs_list if is_medeni_type(s["type"])]

    presets = [
        {
            "id": "pilot",
            "label": "Hazır Soru Havuzu",
            "mode": "SURAHS",
            "surahs": question_surahs or DEFAULT_PILOT_SURAHS,
        },
        {
            "id": "juz30",
            "label": "30. Cüz (Amme)",
            "mode": "JUZS",
            "juzs": [30],
        },
        {
            "id": "juz29",
            "label": "29. Cüz (Tebâreke)",
            "mode": "JUZS",
            "juzs": [29],
        },
        {
            "id": "namaz",
            "label": "Namaz Sureleri",
            "mode": "SURAHS",
            "surahs": NAMAZ_SURAHS,
        },
        {
            "id": "mekki",
            "label": f"Mekkî Sureler ({len(mekki_surahs)})",
            "mode": "SURAHS",
            "surahs": mekki_surahs,
        },
        {
            "id": "medeni",
            "label": f"Medenî Sureler ({len(medeni_surahs)})",
            "mode": "SURAHS",
            "surahs": medeni_surahs,
        },
        {
            "id": "all",
            "label": "Tüm Mushaf (114 Sure)",
            "mode": "ALL",
            "surahs": list(range(1, 115)),
        },
    ]

    f1 = df_am[df_am["ID"] == 1001].iloc[0]
    besmele_tdv, _ = parse_tdv_meal(f1["Diyanet Vakfı Meali"], 1)
    besmele_dib, _ = parse_dib_meal(f1["Diyanet İşleri Meali (Yeni)"])

    meta_payload = {
        "schemaVersion": SCHEMA_VERSION,
        "dataVersion": args.version,
        "besmele": {
            "ayahId": 1001,
            "audioCode": "001001",
            "excludeSurahs": [1, 9],
            "ar": normalize_arabic(str(f1["Arapca_Metin"])),
            "tdv": besmele_tdv,
            "dib": besmele_dib,
        },
        "surahs": surahs_list,
        "juzs": juz_list,
        "presets": presets,
        "verseIndexSchema": ["id", "surah", "ayah", "cuz", "page", "flags"],
        "verseIndexFlags": VERSE_INDEX_FLAGS_LEGEND,
        "verseIndex": verse_index,
    }
    rb, gb = write_json(out_dir / "meta.json", meta_payload, minify=True)
    total_raw_bytes += rb
    total_gz_bytes += gb

    print("6/6 manifest.json ve kalite raporu yazılıyor...")
    manifest_payload = {
        "app": "Muallimun Kur'an & Meal",
        "domain": "[https://meal.muallimun.net](https://meal.muallimun.net)",
        "schemaVersion": SCHEMA_VERSION,
        "dataVersion": args.version,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "defaultPool": {
            "mode": "CUSTOM",
            "surahs": question_surahs or DEFAULT_PILOT_SURAHS,
            "juzs": [],
            "preferredMeal": "m1",
            "arabicAudio": "hatim",
            "mealAudio": "tdv",
        },
        "examEngine": {
            "supportedQuestionCounts": [15, 25, 30, 50, 70, 80, 100],
            "modes": ["curated", "dynamic", "hybrid"],
            "supportsPdfExport": True,
            "supportsBookletAB": True,
        },
        "meals": {
            "m1": {"id": "m1", "label": "Diyanet Vakfı Meali (TDV)", "audioSource": "tdv"},
            "m2": {"id": "m2", "label": "Diyanet İşleri Meali (Yeni)", "audioSource": "dib"},
        },
        "audioSources": AUDIO_SOURCES,
        "stats": {
            "surahs": 114,
            "juzs": 30,
            "ayahs": 6236,
            "words": total_words,
            "questions": len(q_index),
            "questionSurahs": question_surahs,
            "tdvFootnotes": tdv_fn_count,
            "dibFootnotes": dib_fn_count,
            "tdvMergedGroups": tdv_merged_groups,
            "dibMergedGroups": dib_merged_groups,
            "pedagogicalFlags": ped_stats,
        },
    }
    rb, gb = write_json(out_dir / "manifest.json", manifest_payload, minify=False)
    total_raw_bytes += rb
    total_gz_bytes += gb

    quality_report = {
        "schemaVersion": SCHEMA_VERSION,
        "dataVersion": args.version,
        "generatedAt": manifest_payload["generatedAt"],
        "totals": {
            "surahs": 114,
            "juzs": 30,
            "ayahs": 6236,
            "words": total_words,
            "mekkiSurahs": len(mekki_surahs),
            "medeniSurahs": len(medeni_surahs),
            "audioMismatches": audio_mismatches,
            "tdvFootnotesExtracted": tdv_fn_count,
            "dibFootnotesExtracted": dib_fn_count,
            "tdvMergedGroups": tdv_merged_groups,
            "dibMergedGroups": dib_merged_groups,
            "pedagogicalFlags": ped_stats,
            "nullNuzulSurahs": [s["no"] for s in surahs_list if s["nuzul"] is None],
            "nullKonusuSurahs": [s["no"] for s in surahs_list if s["konusu"] is None],
            "totalSizeRawMB": round(total_raw_bytes / (1024 * 1024), 2),
            "totalSizeGzipMB": round(total_gz_bytes / (1024 * 1024), 2),
        },
        "questions": q_report,
    }
    write_json(out_dir / "quality_report.json", quality_report, minify=False)

    print("\n" + "=" * 66)
    print("DÖNÜŞÜM TAMAMLANDI (v2) - ÖZET RAPOR")
    print("=" * 66)
    print(f"Çıktı Klasörü         : {out_dir.resolve()}")
    print(f"Sure / Cüz / Ayet     : 114 ({len(mekki_surahs)} Mekkî, {len(medeni_surahs)} Medenî) / 30 / 6.236")
    print(f"Toplam Kelime         : {total_words:,}")
    print(f"Ses Linki Uyuşmazlığı : {audio_mismatches}")
    print(f"TDV Dipnot / Birleşik : {tdv_fn_count} ayet / {tdv_merged_groups} birleşik grup")
    print(f"DİB Dipnot / Birleşik : {dib_fn_count} ayet / {dib_merged_groups} birleşik grup")
    print(
        f"Pedagojik Bayraklar   : Mukattaa={ped_stats['pureMuqattaat']} | "
        f"AR Tekrar={ped_stats['arDupAny']} (Sureler arası: {ped_stats['arDupCrossSurah']}) | "
        f"TDV Tekrar={ped_stats['tdvDupAny']} (Sureler arası: {ped_stats['tdvDupCrossSurah']}) | "
        f"DİB Tekrar={ped_stats['dibDupAny']} (Sureler arası: {ped_stats['dibDupCrossSurah']})"
    )
    print(f"Sorular (Geçerli)     : {q_report.get('totalValid', 0)} / {q_report.get('totalInput', 0)} -> {q_report.get('bySurah', {})}")
    print(f"Kilitli (lockOrder)   : {q_report.get('lockedQuestionsTotal', 0)} soru -> {q_report.get('lockedAnswerDistribution', {})}")
    print(f"Soru Hata / Uyarı     : {q_report.get('errorCount', 0)} hata, {q_report.get('warningCount', 0)} uyarı")
    print(f"Şık Dağılımı (Önce)   : {q_report.get('answerDistributionBefore', {})}")
    print(f"Şık Dağılımı (Sonra)  : {q_report.get('answerDistributionAfter', {})}")
    for s_key, st in q_report.get("perSurahBalance", {}).items():
        print(f"  -> Sure {s_key:>3} Dağılım : {st.get('distribution', {})} (kilitli={st.get('locked', 0)}, maxArdışık={st.get('maxRun', '-')})")
    print(f"Toplam Boyut (Ham/GZ) : {quality_report['totals']['totalSizeRawMB']} MB / {quality_report['totals']['totalSizeGzipMB']} MB")
    print("=" * 66)

    if q_report.get("errorCount", 0) > 0:
        print("[UYARI] Soru doğrulamasında hatalar bulundu, quality_report.json dosyasını inceleyin!")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())