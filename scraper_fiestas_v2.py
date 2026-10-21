"""
Escáner de fiestas de Barcelona, Madrid y Alicante (versión local).

Hace lo mismo que la Edge Function `scan-sync` del panel de administración
(Eventos → ESCÁNER), pero guarda el resultado en CSV, uno por ciudad, en la
carpeta `eventos_scrap/`:
  - eventos_barcelona.csv
  - eventos_madrid.csv
  - eventos_alicante.csv

Fuentes:
  - Xceed: la página pública de eventos de cada ciudad trae los datos en el
    estado de Next (`self.__next_f`). Su API pide clave (X-API-Key), así que no
    se usa. No trae dirección ni coordenadas de la sala.
  - Resident Advisor: su GraphQL público, con la zona de cada ciudad
    (Barcelona 20, Madrid 41, Alicante 613). Antes estaban mal (24, 44 y 298:
    la 298 es Bochum, en Alemania).

Fourvenues no se escanea: su web está detrás de Cloudflare (403 a cualquier
petición que no sea de un navegador real, y «Too much hype» si se piden varias
páginas seguidas) y su API pide clave. Saltarse esa protección no es legítimo;
para tener sus fiestas hace falta su API oficial para socios o que el local
nos pase el enlace.

Uso:  python scraper_fiestas_v2.py
"""

import csv
import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("FiestasScraper")

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "eventos_scrap")
MADRID = ZoneInfo("Europe/Madrid")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

CIUDADES = {
    "barcelona": {"nombre": "Barcelona", "ra": 20},
    "madrid": {"nombre": "Madrid", "ra": 41},
    "alicante": {"nombre": "Alicante", "ra": 613},
}

CAMPOS = [
    "source", "source_id", "city", "title", "start_time", "end_time", "venue", "address",
    "latitude", "longitude", "poster_url", "event_url", "genres", "lineup", "price", "min_age",
]

RA_QUERY = """query($f: FilterInputDtoInput, $page: Int) {
  eventListings(filters: $f, pageSize: 100, page: $page) {
    totalResults
    data { event { id title startTime endTime contentUrl flyerFront cost minimumAge
      artists { name } genres { name } images { filename }
      venue { name address location { latitude longitude } } } }
  }
}"""


def _texto(v: Any) -> Optional[str]:
    return v.strip() if isinstance(v, str) and v.strip() else None


def _nombres(v: Any) -> List[str]:
    return [n for n in (_texto((x or {}).get("name")) for x in (v or []) if isinstance(x, dict)) if n]


def _iso_madrid(local: Optional[str]) -> Optional[str]:
    """«2026-10-21T23:59:00.000» (hora de Madrid, sin zona) → ISO con zona."""
    if not local:
        return None
    try:
        d = datetime.fromisoformat(local[:19])
    except ValueError:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=MADRID)
    return d.isoformat()


def _precio(v: Any) -> Optional[float]:
    """El menor precio de «0€, 15€» o «5»."""
    if not isinstance(v, str):
        return None
    nums = [float(n.replace(",", ".")) for n in re.findall(r"\d+(?:[.,]\d+)?", v)]
    nums = [n for n in nums if 0 <= n < 1000]
    return min(nums) if nums else None


def _objeto_en(s: str, inicio: int) -> Optional[str]:
    """El objeto JSON completo que empieza en `inicio` (equilibrando llaves)."""
    nivel, en_texto, i = 0, False, inicio
    while i < len(s):
        c = s[i]
        if en_texto:
            if c == "\\":
                i += 1
            elif c == '"':
                en_texto = False
        elif c == '"':
            en_texto = True
        elif c == "{":
            nivel += 1
        elif c == "}":
            nivel -= 1
            if nivel == 0:
                return s[inicio:i + 1]
        i += 1
    return None


class FiestasScraper:
    def __init__(self) -> None:
        self.session = requests.Session()

    def xceed(self, ciudad: str) -> List[Dict[str, Any]]:
        resp = self.session.get(f"https://xceed.me/es/{ciudad}/events", headers={"User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9"}, timeout=20)
        resp.raise_for_status()
        trozos = []
        for m in re.finditer(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', resp.text):
            try:
                trozos.append(json.loads(m.group(1)))
            except json.JSONDecodeError:
                pass
        datos = "".join(trozos)
        vistos, filas = set(), []
        for m in re.finditer(r'\{"id":"[0-9a-f-]{36}","legacyId":\d+', datos):
            bruto = _objeto_en(datos, m.start())
            if not bruto:
                continue
            try:
                e = json.loads(bruto)
            except json.JSONDecodeError:
                continue
            legacy, slug, nombre, inicio = str(e.get("legacyId") or ""), _texto(e.get("slug")), _texto(e.get("name")), e.get("startingTime")
            if not (legacy and slug and nombre and inicio) or legacy in vistos:
                continue
            venue = e.get("venue") or {}
            if (venue.get("city") or {}).get("slug") not in (None, ciudad):
                continue
            vistos.add(legacy)
            fin = e.get("endingTime")
            filas.append({
                "source": "xceed",
                "source_id": legacy,
                "city": CIUDADES[ciudad]["nombre"],
                "title": nombre,
                "start_time": datetime.fromtimestamp(inicio, tz=timezone.utc).astimezone(MADRID).isoformat(),
                "end_time": datetime.fromtimestamp(fin, tz=timezone.utc).astimezone(MADRID).isoformat() if fin else "",
                "venue": _texto(venue.get("name")) or "",
                "address": "",
                "latitude": "",
                "longitude": "",
                "poster_url": _texto(e.get("coverUrl")) or "",
                "event_url": f"https://xceed.me/es/{ciudad}/event/{slug}/{legacy}",
                "genres": "; ".join(_nombres(e.get("musicGenres"))),
                "lineup": "; ".join(_nombres(e.get("lineup"))),
                "price": "",
                "min_age": "",
            })
        return filas

    def resident_advisor(self, ciudad: str) -> List[Dict[str, Any]]:
        filas: List[Dict[str, Any]] = []
        hoy = datetime.now(MADRID).strftime("%Y-%m-%d")
        for page in range(1, 6):
            resp = self.session.post(
                "https://ra.co/graphql",
                json={"query": RA_QUERY, "variables": {"f": {"areas": {"eq": CIUDADES[ciudad]["ra"]}, "listingDate": {"gte": hoy}}, "page": page}},
                headers={"User-Agent": "Fiestea/1.0", "Referer": f"https://ra.co/events/es/{ciudad}"},
                timeout=20,
            )
            resp.raise_for_status()
            listados = ((resp.json().get("data") or {}).get("eventListings") or {})
            lista = listados.get("data") or []
            for entrada in lista:
                e = entrada.get("event") or {}
                inicio, titulo = _iso_madrid(_texto(e.get("startTime"))), _texto(e.get("title"))
                if not inicio or not titulo:
                    continue
                venue = e.get("venue") or {}
                loc = venue.get("location") or {}
                # Sala sin anunciar («TBA»): RA pone 0,0.
                if loc.get("latitude") == 0 and loc.get("longitude") == 0:
                    loc = {}
                imagenes = e.get("images") or []
                url = _texto(e.get("contentUrl")) or f"/events/{e.get('id')}"
                filas.append({
                    "source": "ra",
                    "source_id": str(e.get("id")),
                    "city": CIUDADES[ciudad]["nombre"],
                    "title": titulo,
                    "start_time": inicio,
                    "end_time": _iso_madrid(_texto(e.get("endTime"))) or "",
                    "venue": _texto(venue.get("name")) or "",
                    "address": _texto(venue.get("address")) or "",
                    "latitude": loc.get("latitude") if loc.get("latitude") is not None else "",
                    "longitude": loc.get("longitude") if loc.get("longitude") is not None else "",
                    "poster_url": _texto(e.get("flyerFront")) or (_texto(imagenes[0].get("filename")) if imagenes else "") or "",
                    "event_url": f"https://ra.co{url}" if url.startswith("/") else url,
                    "genres": "; ".join(_nombres(e.get("genres"))),
                    "lineup": "; ".join(_nombres(e.get("artists"))),
                    "price": _precio(e.get("cost")) if _precio(e.get("cost")) is not None else "",
                    "min_age": e.get("minimumAge") if isinstance(e.get("minimumAge"), int) else "",
                })
            if len(lista) < 100 or page * 100 >= (listados.get("totalResults") or 0):
                break
            time.sleep(1)
        return filas

    def run(self) -> None:
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        for ciudad in CIUDADES:
            filas: List[Dict[str, Any]] = []
            for nombre, leer in (("Xceed", self.xceed), ("Resident Advisor", self.resident_advisor)):
                try:
                    lista = leer(ciudad)
                    logger.info(f"[{nombre}] {len(lista)} fiestas en {ciudad}.")
                    filas.extend(lista)
                except Exception as e:  # noqa: BLE001
                    logger.error(f"[{nombre}] Error en {ciudad}: {e}")
                time.sleep(1)
            # RA repite la misma fiesta en varios listados: una sola vez cada una.
            unicas = list({(f["source"], f["source_id"]): f for f in filas}.values())
            ruta = os.path.join(OUTPUT_DIR, f"eventos_{ciudad}.csv")
            with open(ruta, "w", newline="", encoding="utf-8-sig") as fh:
                writer = csv.DictWriter(fh, fieldnames=CAMPOS)
                writer.writeheader()
                writer.writerows(unicas)
            logger.info(f"==> {len(unicas)} fiestas guardadas en {ruta}")


if __name__ == "__main__":
    FiestasScraper().run()
