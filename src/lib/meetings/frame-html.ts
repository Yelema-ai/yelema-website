import { PLATFORM_LABELS, durationLabel, initials } from "./labels.ts";
import type { MeetingMinutes, MeetingTask } from "./minutes.ts";
import { GREETING, attendees, esc, meetingDate, meetingTime, plural, roleLine, type FrameMeeting } from "./minutes-parts.ts";
import { paletteOf, type MinutesPalette } from "./minutes-palette.ts";
import type { Byline } from "./record.ts";

export type { FrameMeeting };

const when = (iso: string, kind: "date" | "time", text: string) => `<time datetime="${esc(iso)}" data-k="${kind}">${esc(text)}</time>`;

const ICONS = {
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  essential: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2Z"/>',
  decision: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  action: '<path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  who: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  assign: '<circle cx="10" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h4c1 0 1.9.2 2.7.6M19 15v6M16 18h6"/>',
} as const;

type IconName = keyof typeof ICONS;

const icon = (name: IconName, cls = "i") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const YELEMA_MARK =
  '<svg class="mark" viewBox="0 0 99.11 99.28" aria-hidden="true"><defs><radialGradient id="yg" cx="49.56" cy="49.73" fx="3.27" fy="-8.67" r="76.82" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#A88BFF"/><stop offset=".45" stop-color="#8D68FA"/><stop offset=".75" stop-color="#6250E4"/><stop offset="1" stop-color="#301667"/></radialGradient></defs><rect y=".17" width="99.11" height="99.11" rx="23.65" ry="23.65" fill="url(#yg)"/><g fill="#fff"><rect x="18.9" y="31.58" width="40.4" height="13.47" rx="6.73" ry="6.73" transform="translate(41.55 92.99) rotate(-136.99)"/><rect x="28.77" y="54.23" width="40.4" height="13.47" rx="6.73" ry="6.73" transform="translate(109.94 11.99) rotate(90)"/><path d="M73.59,24.53c-2.54-2.72-6.8-2.87-9.52-.33l-14.44,13.47,4.23,3.94c1.74,1.42,2.77,3.58,2.77,5.89v2.06l16.63-15.52c2.72-2.54,2.87-6.8.33-9.52Z"/></g></svg>';

const section = (name: IconName, title: string, count: number | null, body: string) =>
  `<section><h2><span class="badge">${icon(name)}</span>${esc(title)}${count ? ` <span class="count">(${count})</span>` : ""}</h2>${body}</section>`;

function face(byline: Byline | null, size: "s" | "l"): string {
  if (!byline) return "";
  if (byline.photo) return `<img class="face ${size}" src="${esc(byline.photo)}" alt="${esc(byline.expert)}" width="${size === "l" ? 52 : 40}" height="${size === "l" ? 52 : 40}">`;
  return `<span class="face ${size} initials">${esc(initials(byline.expert))}</span>`;
}

function action(t: MeetingTask, k: number): string {
  const who = t.owner ? `<span class="who">${icon("who", "i s")}${esc(t.owner)}</span>` : `<span class="who free">${icon("assign", "i s")}À attribuer</span>`;
  const due = t.due ? `<span class="sep">|</span><span class="who">${icon("calendar", "i s")}${esc(t.due)}</span>` : "";
  return `<li><span class="n">${k}</span><div><p>${esc(t.text)}</p><div class="meta">${who}${due}</div></div></li>`;
}

function signature(byline: Byline | null, appName: string): string {
  const role = byline ? roleLine(byline) : "";
  const who = byline
    ? `<div class="sign">${face(byline, "l")}<div><p class="by">Rédigé par <strong>${esc(byline.expert)}</strong></p>${role ? `<p class="role">${esc(role)}</p>` : ""}</div></div>`
    : "<div></div>";
  return `<footer>${who}<div class="powered">Powered by<span class="brand">${YELEMA_MARK}${esc(appName)}</span></div></footer>`;
}

const rootStyle = (p: MinutesPalette) =>
  `:root{--main:${p.main};--accent:${p.accent};--pale:${p.pale};--line:${p.line};--text:${p.text};--muted:${p.muted};--bg:${p.bg};--free:${p.free};color-scheme:light}`;

const STYLE = `
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 "Segoe UI",Roboto,Helvetica,Arial,sans-serif;overflow-x:hidden;overflow-wrap:anywhere}
main{max-width:640px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden}
p{margin:0}ul,ol{margin:0;padding:0;list-style:none}
.head{padding:24px 32px 18px;border-bottom:3px solid var(--main)}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.company{font-size:20px;font-weight:800;color:var(--main);letter-spacing:.02em}
.logo{display:block;width:auto;height:auto;max-width:180px;max-height:36px;object-fit:contain}
.kicker{font-size:12px;font-weight:700;letter-spacing:1.5px;color:var(--accent)}
h1{margin:18px 0 12px;font-size:22px;line-height:28px;font-weight:700;color:var(--main)}
.pills{display:flex;flex-wrap:wrap;gap:6px}
.pill{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:999px;background:var(--pale);color:var(--main);font-size:13px}
.i{width:16px;height:16px;flex:none}.i.s{width:14px;height:14px}
.body{padding:0 32px 24px}
.hello{display:flex;gap:10px;align-items:flex-start;padding-top:22px;font-size:15px;line-height:22px}
.face{display:block;flex:none;border-radius:50%;object-fit:cover}.face.s{width:40px;height:40px}.face.l{width:52px;height:52px}
.initials{display:grid;place-items:center;background:var(--pale);color:var(--main);font-weight:700;font-size:15px}
.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:16px}
.stat{border:1px solid var(--line);border-radius:12px;padding:12px 8px;text-align:center}
.stat b{display:inline-flex;align-items:center;gap:6px;font-size:24px;font-weight:700;color:var(--main)}.stat b .i{width:18px;height:18px}
.stat span{display:block;font-size:13px;color:var(--muted)}
section{padding-top:28px}
h2{display:flex;align-items:center;gap:8px;margin:0;font-size:17px;font-weight:700;color:var(--main)}
.badge{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--main);color:#fff}
.count{color:var(--muted);font-weight:400}
.bullets{margin-top:10px;padding-left:20px;list-style:disc}.bullets li{margin:0 0 6px;font-size:15px;line-height:22px}
.decisions li{display:flex;gap:8px;padding-top:10px;font-size:15px;line-height:22px}
.decisions .n{flex:none;width:18px;font-weight:700;color:var(--accent)}
.actions{margin-top:10px}.actions li{display:flex;gap:8px;padding:12px 0;border-top:1px solid var(--line)}
.actions .n{flex:none;width:18px;font-size:13px;font-weight:700;color:var(--accent)}
.actions p{font-size:15px;line-height:21px}
.meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:4px;font-size:13px;font-weight:600;color:var(--main)}
.who{display:inline-flex;align-items:center;gap:4px}.free{color:var(--free)}.sep{color:var(--line)}
.people-title{display:flex;align-items:center;gap:5px;padding-top:28px;margin-bottom:10px;font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase}
.people{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px}
.people li{display:flex;align-items:center;gap:6px;min-width:0}
.people .initials{width:30px;height:30px;border-radius:50%;font-size:12px;flex:none}
.people b{display:block;font-size:14px;font-weight:600}.people small{display:block;font-size:12px;color:var(--muted)}
footer{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:24px 32px 0;padding:20px 0 24px;border-top:1px solid var(--line)}
.sign{display:flex;align-items:center;gap:10px;min-width:0}
.by{font-size:15px}.by strong{font-weight:700}.role{font-size:13px;color:var(--muted)}
.powered{flex:none;text-align:right;font-size:11px;color:var(--muted)}
.brand{display:flex;align-items:center;justify-content:flex-end;gap:4px;margin-top:4px;font-size:12px;font-weight:700;color:var(--main)}
.mark{width:18px;height:18px}
@media (max-width:520px){main{margin:0;border-radius:0}.head,.body{padding-left:20px;padding-right:20px}footer{margin:24px 20px 0}.people{grid-template-columns:minmax(0,1fr)}}
@media print{body{background:#fff}main{margin:0}section{break-inside:avoid}}
`;

const SCRIPT = `(function(){
var tz;try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){}
document.querySelectorAll("time[data-k]").forEach(function(t){var d=new Date(t.getAttribute("datetime"));if(isNaN(d))return;
try{if(t.dataset.k==="date"){var s=d.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",timeZone:tz});t.textContent=s.charAt(0).toUpperCase()+s.slice(1)}
else{t.textContent=d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit",timeZone:tz})}}catch(e){}});
})();`;

export function minutesFrameHtml(minutes: MeetingMinutes, meeting: FrameMeeting, appName: string): string {
  const start = meeting.joinedAt ?? meeting.createdAt;
  const duration = durationLabel(meeting);
  const people = attendees(minutes, meeting);
  const pills = [
    `<span class="pill">${icon("calendar", "i s")}${when(start, "date", meetingDate(start, "UTC"))}</span>`,
    `<span class="pill">${icon("clock", "i s")}<span>${when(start, "time", meetingTime(start, "UTC"))}${duration ? `, ${esc(duration)}` : ""}</span></span>`,
    people.length ? `<span class="pill">${icon("users", "i s")}${people.length} ${plural(people.length, "présent", "présents")}</span>` : "",
    `<span class="pill">${icon("pin", "i s")}${esc(PLATFORM_LABELS[meeting.platform])}</span>`,
  ].join("");
  const d = minutes.decisions.length;
  const t = minutes.tasks.length;
  const q = minutes.questions.length;
  const company = meeting.byline?.company;
  const logo = meeting.byline?.logo;
  const brand = logo
    ? `<img class="logo" src="${esc(logo)}" alt="${esc(company ?? "")}">`
    : company
      ? `<span class="company">${esc(company)}</span>`
      : "<span></span>";

  const head = `<header class="head"><div class="top">${brand}<span class="kicker">COMPTE RENDU</span></div><h1>${esc(minutes.title)}</h1><div class="pills">${pills}</div></header>`;
  const hello = `<div class="hello">${face(meeting.byline, "s")}<p>${GREETING.opening}<br>${GREETING.line}</p></div>`;
  const counts: [IconName, number, string][] = [
    ["decision", d, plural(d, "décision", "décisions")],
    ["action", t, plural(t, "action", "actions")],
    ["question", q, plural(q, "question", "questions")],
  ];
  const stats = `<div class="stats">${counts.map(([name, n, label]) => `<div class="stat"><b>${icon(name)}${n}</b><span>${label}</span></div>`).join("")}</div>`;

  const body = [
    hello,
    stats,
    minutes.essentials.length ? section("essential", "L’essentiel", null, `<ul class="bullets">${minutes.essentials.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`) : "",
    d ? section("decision", "Décisions", d, `<ol class="decisions">${minutes.decisions.map((x, k) => `<li><span class="n">${k + 1}.</span><p>${esc(x)}</p></li>`).join("")}</ol>`) : "",
    t ? section("action", "Actions", t, `<ol class="actions">${minutes.tasks.map((x, k) => action(x, k + 1)).join("")}</ol>`) : "",
    q ? section("question", "Questions ouvertes", q, `<ul class="bullets">${minutes.questions.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`) : "",
    people.length
      ? `<p class="people-title">${icon("users", "i s")}Participants</p><ul class="people">${people
          .map((p) => `<li><span class="initials">${esc(initials(p.name))}</span><div><b>${esc(p.name)}</b>${p.role ? `<small>${esc(p.role)}</small>` : ""}</div></li>`)
          .join("")}</ul>`
      : "",
  ].join("");

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>Compte rendu : ${esc(minutes.title)}</title><style>${rootStyle(paletteOf(meeting.byline?.color))}${STYLE}</style></head><body><main>${head}<div class="body">${body}</div>${signature(meeting.byline, appName)}</main><script>${SCRIPT}</script></body></html>`;
}
