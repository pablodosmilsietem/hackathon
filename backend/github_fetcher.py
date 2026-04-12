"""
Cliente GitHub: recorre eventos del usuario (pushes, issues, PRs…) y agrega métricas.

La API de eventos solo expone páginas recientes (GitHub limita el historial visible);
para “todos los commits” en ese alcance se pagina hasta `max_event_pages`.
Los pushes con >20 commits en el payload usan `distinct_size` / `size` del evento.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator

import httpx

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"

_GRAPHQL_CONTRIBUTIONS = """
query($from: DateTime!, $to: DateTime!) {
  viewer {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}
"""


def _github_terminal_logs_enabled() -> bool:
    """Logs detallados en consola (cada /api/status). Desactivar: TAMAGOTCHI_GITHUB_LOG=0"""
    return os.environ.get("TAMAGOTCHI_GITHUB_LOG", "1").strip().lower() not in (
        "0",
        "false",
        "no",
    )


def _utc_start_of_day(dt: datetime) -> datetime:
    z = dt.astimezone(timezone.utc)
    return datetime.combine(z.date(), datetime.min.time(), tzinfo=timezone.utc)


def _utc_start_of_iso_week(dt: datetime) -> datetime:
    """Lunes 00:00 UTC de la semana ISO que contiene dt."""
    z = dt.astimezone(timezone.utc).date()
    monday = z - timedelta(days=z.weekday())
    return datetime.combine(monday, datetime.min.time(), tzinfo=timezone.utc)

# Eventos que contamos como “interacción” (~7 d)
_INTERACTION_TYPES = frozenset(
    {
        "IssuesEvent",
        "PullRequestEvent",
        "IssueCommentEvent",
        "PullRequestReviewCommentEvent",
        "PullRequestReviewEvent",
        "ForkEvent",
        "WatchEvent",
        "CreateEvent",
        "DeleteEvent",
        "ReleaseEvent",
    }
)


@dataclass(frozen=True)
class CommitInfo:
    sha: str
    message: str
    repository_full_name: str
    pushed_at: datetime
    author_name: str | None = None


class GithubFetcher:
    """
    Obtiene commits recientes vía `PushEvent` y resume actividad para el Tamagotchi.
    """

    def __init__(self, token: str | None = None, login: str | None = None) -> None:
        raw_t = (token if token is not None else os.environ.get("GITHUB_TOKEN", "")).strip()
        raw_l = (login if login is not None else os.environ.get("GITHUB_LOGIN", "")).strip()
        self.token: str | None = raw_t or None
        self.login: str | None = raw_l or None
        self._headers: dict[str, str] = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self.token:
            self._headers["Authorization"] = f"Bearer {self.token}"

    def _client(self) -> httpx.Client:
        return httpx.Client(base_url=GITHUB_API, headers=self._headers, timeout=45.0)

    def resolve_login(self) -> str:
        """Usuario a consultar: GITHUB_LOGIN o, con token, el login del token."""
        if self.login:
            if _github_terminal_logs_enabled():
                logger.info("GitHub: usando login fijado (GITHUB_LOGIN o sesión) → %s", self.login)
            return self.login
        if not self.token:
            raise ValueError(
                "Indica GITHUB_LOGIN (eventos públicos) o GITHUB_TOKEN (login vía /user)."
            )
        with self._client() as c:
            r = c.get("/user")
            try:
                r.raise_for_status()
            except httpx.HTTPStatusError as e:
                snippet = (e.response.text or "")[:400].replace("\n", " ")
                logger.error(
                    "GitHub GET /user → HTTP %s %r (¿token inválido o sin scope?) %s",
                    e.response.status_code,
                    e.response.reason_phrase,
                    snippet,
                )
                raise
            self.login = str(r.json()["login"])
            if _github_terminal_logs_enabled():
                logger.info("GitHub: login resuelto vía /user → %s", self.login)
            return self.login

    def _events_path(self, login: str) -> str:
        if self.token:
            return f"/users/{login}/events"
        return f"/users/{login}/events/public"

    def iter_events(self, *, max_pages: int = 10, per_page: int = 100) -> Iterator[dict[str, Any]]:
        """Páginas de eventos (máx. 100 por página en la API)."""
        login = self.resolve_login()
        path = self._events_path(login)
        auth = "sí" if self.token else "no"
        if _github_terminal_logs_enabled():
            logger.info(
                "GitHub: pidiendo eventos GET %s (token=%s, max_pages=%s)",
                path,
                auth,
                max_pages,
            )
        with self._client() as c:
            for page in range(1, max_pages + 1):
                r = c.get(path, params={"page": page, "per_page": min(per_page, 100)})
                try:
                    r.raise_for_status()
                except httpx.HTTPStatusError as e:
                    snippet = (e.response.text or "")[:500].replace("\n", " ")
                    logger.error(
                        "GitHub GET %s page=%s → HTTP %s %r %s",
                        path,
                        page,
                        e.response.status_code,
                        e.response.reason_phrase,
                        snippet,
                    )
                    raise
                batch: list[Any] = r.json()
                if page == 1 and _github_terminal_logs_enabled():
                    sample_types: list[Any] = []
                    for ev in batch[:8]:
                        if isinstance(ev, dict):
                            sample_types.append(ev.get("type"))
                    logger.info(
                        "GitHub: página 1 → %s eventos; tipos (muestra): %s",
                        len(batch),
                        sample_types,
                    )
                if not batch:
                    if page == 1 and _github_terminal_logs_enabled():
                        logger.warning(
                            "GitHub: página 1 vacía (0 eventos). Revisa scopes OAuth (repo) o actividad pública."
                        )
                    break
                for ev in batch:
                    if isinstance(ev, dict):
                        yield ev

    def _push_commit_count(self, payload: dict[str, Any]) -> int:
        """Commits del push: tamaño real si GitHub trunca la lista a 20."""
        if not payload:
            return 0
        for key in ("distinct_size", "size"):
            v = payload.get(key)
            if isinstance(v, int) and v >= 0:
                return v
        commits = payload.get("commits") or []
        if isinstance(commits, list):
            return len(commits)
        return 0

    def iter_commits_from_push_events(self, *, max_pages: int = 10) -> Iterator[CommitInfo]:
        """Todos los commits individuales que aparecen en los PushEvent (dedup por sha)."""
        seen: set[str] = set()
        for ev in self.iter_events(max_pages=max_pages):
            if ev.get("type") != "PushEvent":
                continue
            repo = ev.get("repo") or {}
            repo_name = repo.get("name") if isinstance(repo, dict) else ""
            if not isinstance(repo_name, str):
                repo_name = ""
            created = ev.get("created_at")
            if not created or not isinstance(created, str):
                continue
            pushed_at = datetime.fromisoformat(created.replace("Z", "+00:00"))
            payload = ev.get("payload") if isinstance(ev.get("payload"), dict) else {}
            for c in payload.get("commits") or []:
                if not isinstance(c, dict):
                    continue
                sha = c.get("sha")
                if not isinstance(sha, str) or sha in seen:
                    continue
                seen.add(sha)
                author = c.get("author") if isinstance(c.get("author"), dict) else {}
                msg = c.get("message")
                line = (msg.split("\n", 1)[0] if isinstance(msg, str) else "")[:200]
                name = author.get("name") if isinstance(author.get("name"), str) else None
                yield CommitInfo(
                    sha=sha,
                    message=line,
                    repository_full_name=repo_name,
                    pushed_at=pushed_at,
                    author_name=name,
                )

    def fetch_all_commits(self, *, max_event_pages: int = 10) -> list[CommitInfo]:
        """Lista de commits vistos en los eventos recientes (alcance limitado por GitHub)."""
        return list(self.iter_commits_from_push_events(max_pages=max_event_pages))

    def _graphql_contribution_totals(self, now: datetime) -> dict[str, int] | None:
        """
        Totales del calendario de contribuciones (commits/PRs/issues que cuenta GitHub en el perfil).
        Requiere token; no usa el feed /events (que a menudo no incluye pushes recientes).
        """
        if not self.token:
            return None
        from_dt = now - timedelta(days=21)
        variables = {
            "from": from_dt.strftime("%Y-%m-%dT00:00:00Z"),
            "to": now.strftime("%Y-%m-%dT23:59:59Z"),
        }
        try:
            with self._client() as c:
                r = c.post(
                    "/graphql",
                    json={"query": _GRAPHQL_CONTRIBUTIONS, "variables": variables},
                )
                r.raise_for_status()
                body = r.json()
        except httpx.HTTPStatusError as e:
            snippet = (e.response.text or "")[:400].replace("\n", " ")
            logger.error("GitHub GraphQL HTTP %s %r %s", e.response.status_code, e.response.reason_phrase, snippet)
            return None
        except Exception as e:
            logger.error("GitHub GraphQL error: %s", e)
            return None

        if not isinstance(body, dict):
            return None
        errs = body.get("errors")
        if errs:
            logger.warning("GitHub GraphQL errors: %s", errs[:3] if isinstance(errs, list) else errs)
            return None

        cal = (
            (body.get("data") or {})
            .get("viewer", {})
            .get("contributionsCollection", {})
            .get("contributionCalendar", {})
        )
        weeks = cal.get("weeks") if isinstance(cal, dict) else None
        if not isinstance(weeks, list):
            return None

        by_date: dict[str, int] = {}
        for w in weeks:
            if not isinstance(w, dict):
                continue
            for day in w.get("contributionDays") or []:
                if not isinstance(day, dict):
                    continue
                ds = day.get("date")
                cnt = day.get("contributionCount")
                try:
                    n = int(cnt) if cnt is not None else 0
                except (TypeError, ValueError):
                    n = 0
                if isinstance(ds, str) and n >= 0:
                    by_date[ds] = n

        today_d = now.date()
        today_s = today_d.isoformat()
        today_u = by_date.get(today_s, 0)

        last_7_cal = 0
        for i in range(7):
            d = (today_d - timedelta(days=i)).isoformat()
            last_7_cal += by_date.get(d, 0)

        week_start = _utc_start_of_iso_week(now).date()
        iso_week_total = 0
        d = week_start
        while d <= today_d:
            iso_week_total += by_date.get(d.isoformat(), 0)
            d += timedelta(days=1)

        return {
            "today_utc": today_u,
            "last_7_calendar_days": last_7_cal,
            "iso_week_total": iso_week_total,
        }

    def activity_metrics(self, *, max_event_pages: int = 15) -> dict[str, int]:
        """
        Métricas alineadas con docs/BACKEND.md.
        contributions_* cuentan commits de PushEvent; interactions_* cuentan otros eventos en 7 d.
        commits_today_utc / commits_this_week_utc usan la fecha del PushEvent (UTC).
        commits_in_events_feed suma todos los PushEvent devueltos por la API (alcance paginado).
        Con token OAuth/PAT, las «contribuciones» del perfil (c24/c7 y filas de hoy/semana)
        se rellenan vía GraphQL si el feed de eventos viene casi vacío (p. ej. solo MemberEvent).
        """
        now = datetime.now(timezone.utc)
        cut24 = now - timedelta(hours=24)
        cut7 = now - timedelta(days=7)
        start_day = _utc_start_of_day(now)
        start_week = _utc_start_of_iso_week(now)
        commits_24h = 0
        commits_7d = 0
        commits_today = 0
        commits_this_week = 0
        commits_in_feed = 0
        interactions_7d = 0
        total_events = 0
        push_events = 0

        for ev in self.iter_events(max_pages=max_event_pages):
            total_events += 1
            created = ev.get("created_at")
            if not isinstance(created, str):
                continue
            t = datetime.fromisoformat(created.replace("Z", "+00:00"))
            typ = ev.get("type")

            if typ == "PushEvent":
                push_events += 1
                payload = ev.get("payload") if isinstance(ev.get("payload"), dict) else {}
                n = self._push_commit_count(payload)
                commits_in_feed += n
                if t >= start_day:
                    commits_today += n
                if t >= start_week:
                    commits_this_week += n
                if t < cut7:
                    continue
                commits_7d += n
                if t >= cut24:
                    commits_24h += n
            elif typ in _INTERACTION_TYPES and t >= cut7:
                interactions_7d += 1

        gq = self._graphql_contribution_totals(now)
        if gq:
            commits_24h = max(commits_24h, gq["today_utc"])
            commits_7d = max(commits_7d, gq["last_7_calendar_days"])
            commits_today = max(commits_today, gq["today_utc"])
            commits_this_week = max(commits_this_week, gq["iso_week_total"])
            if _github_terminal_logs_enabled():
                logger.info(
                    "GitHub GraphQL calendario: hoy_utc=%s últimos_7_días_cal=%s semana_ISO=%s",
                    gq["today_utc"],
                    gq["last_7_calendar_days"],
                    gq["iso_week_total"],
                )

        login = self.login or "?"
        if total_events == 0:
            logger.warning(
                "GitHub: 0 eventos en el feed para login=%s. "
                "Si usas OAuth, reconecta tras ampliar scopes (p. ej. repo para repos privados).",
                login,
            )
        elif commits_in_feed == 0 and push_events > 0:
            logger.warning(
                "GitHub: %s PushEvent pero 0 commits contados (login=%s); payload inesperado.",
                push_events,
                login,
            )
        elif commits_in_feed == 0:
            logger.info(
                "GitHub: %s eventos, ningún push con commits (login=%s). "
                "Las contribuciones del perfil vienen del calendario GraphQL si hay token.",
                total_events,
                login,
            )

        if _github_terminal_logs_enabled():
            logger.info(
                "GitHub métricas login=%s | eventos_leídos=%s push_events=%s | "
                "c24h=%s c7d=%s i7d=%s | hoy_utc=%s semana_utc=%s feed_commits=%s | graph=%s",
                login,
                total_events,
                push_events,
                commits_24h,
                commits_7d,
                interactions_7d,
                commits_today,
                commits_this_week,
                commits_in_feed,
                "sí" if gq else "no",
            )

        return {
            "contributions_last_24h": commits_24h,
            "contributions_last_7d": commits_7d,
            "interactions_last_7d": interactions_7d,
            "commits_today_utc": commits_today,
            "commits_this_week_utc": commits_this_week,
            "commits_in_events_feed": commits_in_feed,
        }
