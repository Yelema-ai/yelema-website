import { iconUrl, yelemaMarkUrl, type EmailIcon } from "./email-icons.ts";
import { PLATFORM_LABELS, durationLabel, initials } from "./labels.ts";
import type { MeetingMinutes, MeetingTask } from "./minutes.ts";
import { GREETING, attendees, esc, meetingDate, meetingTime, plural, roleLine, type FrameMeeting } from "./minutes-parts.ts";
import { paletteOf, type MinutesPalette } from "./minutes-palette.ts";
import type { Byline } from "./record.ts";

export interface MinutesEmailContext {
  link: string;
  origin: string;
  timeZone: string;
  appName: string;
  from: string | null;
}

const F = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

function renderer(origin: string, C: MinutesPalette) {
  const src = (name: EmailIcon) => esc(iconUrl(origin, name, C.main));
  const ico = (name: EmailIcon, size = 16, mr = 6) =>
    `<img src="${src(name)}" width="${size}" height="${size}" alt="" style="display:inline-block;width:${size}px;height:${size}px;border:0;vertical-align:-3px;margin-right:${mr}px;">`;
  const section = (name: EmailIcon, title: string, count: number, body: string) => `
<tr><td style="padding:28px 32px 0 32px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="32" valign="middle"><div style="width:28px;height:28px;border-radius:14px;background:${C.main};text-align:center;"><img src="${src(name)}" width="16" height="16" alt="" style="display:inline-block;width:16px;height:16px;border:0;margin-top:6px;"></div></td>
    <td valign="middle" style="${F}font-size:17px;font-weight:700;color:${C.main};padding-left:8px;">${esc(title)}${count ? ` <span style="color:${C.muted};font-weight:400;">(${count})</span>` : ""}</td>
  </tr></table>
  ${body}
</td></tr>`;
  return { src, ico, section };
}

function face(byline: Byline, size: number, C: MinutesPalette): string {
  const radius = size / 2;
  if (byline.photo) {
    return `<img src="${esc(byline.photo)}" alt="${esc(byline.expert)}" width="${size}" height="${size}" style="display:block;width:${size}px;height:${size}px;border-radius:${radius}px;border:0;">`;
  }
  return `<div style="width:${size}px;height:${size}px;line-height:${size}px;border-radius:${radius}px;background:${C.pale};color:${C.main};text-align:center;${F}font-size:${Math.round(size * 0.36)}px;font-weight:700;">${esc(initials(byline.expert))}</div>`;
}

const bullets = (items: string[], C: MinutesPalette) =>
  `<ul style="${F}font-size:15px;line-height:22px;color:${C.text};margin:10px 0 0 0;padding-left:20px;">${items.map((x) => `<li style="margin:0 0 6px 0;">${esc(x)}</li>`).join("")}</ul>`;

export function minutesEmailHtml(minutes: MeetingMinutes, meeting: FrameMeeting, ctx: MinutesEmailContext): string {
  const byline = meeting.byline;
  const C = paletteOf(byline?.color);
  const { ico, section } = renderer(ctx.origin, C);
  const start = meeting.joinedAt ?? meeting.createdAt;
  const duration = durationLabel(meeting);
  const people = attendees(minutes, meeting);
  const d = minutes.decisions.length;
  const t = minutes.tasks.length;
  const q = minutes.questions.length;

  const pill = (name: EmailIcon, text: string) =>
    `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 10px;border-radius:999px;background:${C.pale};color:${C.main};${F}font-size:13px;">${ico(name, 14, 5)}${esc(text)}</span>`;
  const pills = [
    pill("calendar", meetingDate(start, ctx.timeZone)),
    pill("clock", `${meetingTime(start, ctx.timeZone)}${duration ? `, ${duration}` : ""}`),
    people.length ? pill("users", `${people.length} ${plural(people.length, "présent", "présents")}`) : "",
    pill("pin", PLATFORM_LABELS[meeting.platform]),
  ].join("");

  const brand = byline?.logo
    ? `<img src="${esc(byline.logo)}" alt="${esc(byline.company ?? "")}" height="32" style="display:block;height:32px;width:auto;max-width:200px;border:0;">`
    : byline?.company
      ? `<span style="${F}font-size:20px;font-weight:800;color:${C.main};">${esc(byline.company)}</span>`
      : "";

  const stats = (
    [
      ["decisions-c", d, plural(d, "décision", "décisions")],
      ["actions-c", t, plural(t, "action", "actions")],
      ["questions-c", q, plural(q, "question", "questions")],
    ] as const
  )
    .map(
      ([name, n, label]) => `<td width="33%" style="padding:0 4px;"><div style="border:1px solid ${C.line};border-radius:12px;padding:12px 8px;text-align:center;">
        <div style="${F}font-size:24px;font-weight:700;color:${C.main};">${ico(name, 18, 6)}${n}</div><div style="${F}font-size:13px;color:${C.muted};">${label}</div></div></td>`
    )
    .join("");

  const decisions = minutes.decisions
    .map(
      (x, k) => `<tr><td width="22" valign="top" style="${F}font-size:15px;font-weight:700;color:${C.accent};padding:10px 0 0 0;">${k + 1}.</td>
        <td style="${F}font-size:15px;line-height:22px;color:${C.text};padding:10px 0 0 0;">${esc(x)}</td></tr>`
    )
    .join("");

  const action = (task: MeetingTask, k: number) => {
    const who = task.owner ? `${ico("qui", 14, 4)}${esc(task.owner)}` : `<span style="color:${C.free};">${ico("attribuer", 14, 4)}À attribuer</span>`;
    const due = task.due ? ` <span style="color:${C.line};">|</span> ${ico("quand", 14, 4)}${esc(task.due)}` : "";
    return `<tr>
          <td width="22" valign="top" style="${F}font-size:13px;font-weight:700;color:${C.accent};padding:12px 0;border-top:1px solid ${C.line};">${k}</td>
          <td valign="top" style="${F}padding:12px 0;border-top:1px solid ${C.line};">
            <div style="font-size:15px;line-height:21px;color:${C.text};">${esc(task.text)}</div>
            <div style="font-size:13px;font-weight:600;color:${C.main};margin-top:4px;">${who}${due}</div></td></tr>`;
  };

  const cells = people.map(
    (p) => `<td width="50%" style="padding:0 12px 10px 0;" valign="top"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td width="34"><div style="width:30px;height:30px;line-height:30px;border-radius:15px;background:${C.pale};color:${C.main};text-align:center;${F}font-size:12px;font-weight:700;">${esc(initials(p.name))}</div></td>
        <td style="${F}padding-left:6px;"><div style="font-size:14px;font-weight:600;color:${C.text};">${esc(p.name)}</div>${p.role ? `<div style="font-size:12px;color:${C.muted};">${esc(p.role)}</div>` : ""}</td></tr></table></td>`
  );
  const rows = Array.from({ length: Math.ceil(cells.length / 2) }, (_, k) => `<tr>${cells.slice(k * 2, k * 2 + 2).join("")}</tr>`).join("");

  const preheader = [
    `${d} ${plural(d, "décision", "décisions")} et ${t} ${plural(t, "action", "actions")}.`,
    minutes.essentials[0] ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const signature = byline
    ? `<tr><td style="padding:24px 32px 24px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line};"><tr>
      <td valign="middle" style="padding-top:20px;" width="60">${face(byline, 52, C)}</td>
      <td valign="middle" style="padding:20px 0 0 4px;${F}">
        <div style="font-size:15px;font-weight:700;color:${C.text};">${esc(byline.expert)}</div>
        <div style="font-size:13px;color:${C.muted};">${esc(roleLine(byline))}</div>
        ${ctx.from ? `<div style="font-size:13px;"><a href="mailto:${esc(ctx.from)}" style="color:${C.accent};text-decoration:none;">${esc(ctx.from)}</a></div>` : ""}
      </td>
      <td valign="bottom" align="right" style="padding-top:20px;${F}font-size:11px;color:${C.muted};white-space:nowrap;">Powered by<br><img src="${esc(yelemaMarkUrl(ctx.origin))}" alt="${esc(ctx.appName)}" height="22" style="display:inline-block;height:22px;width:auto;border:0;margin-top:4px;"></td>
    </tr></table>
  </td></tr>`
    : "";

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Compte rendu : ${esc(minutes.title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
  <tr><td style="padding:24px 32px 18px 32px;border-bottom:3px solid ${C.main};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="middle">${brand}</td>
      <td valign="middle" align="right" style="${F}font-size:12px;font-weight:700;letter-spacing:1.5px;color:${C.accent};">COMPTE RENDU</td>
    </tr></table>
    <div style="${F}font-size:22px;line-height:28px;font-weight:700;color:${C.main};margin:18px 0 12px 0;">${esc(minutes.title)}</div>
    ${pills}
  </td></tr>
  <tr><td style="padding:22px 32px 0 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      ${byline ? `<td width="44" valign="top">${face(byline, 40, C)}</td>` : ""}
      <td valign="top" style="${F}font-size:15px;line-height:22px;color:${C.text};padding-left:8px;">${GREETING.opening}<br>${GREETING.line}</td>
    </tr></table></td></tr>
  <tr><td style="padding:16px 28px 0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${stats}</tr></table></td></tr>
  ${minutes.essentials.length ? section("essentiel", "L’essentiel", 0, bullets(minutes.essentials, C)) : ""}
  ${d ? section("decisions", "Décisions", d, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${decisions}</table>`) : ""}
  ${t ? section("actions", "Actions", t, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">${minutes.tasks.map((x, k) => action(x, k + 1)).join("")}</table>`) : ""}
  ${q ? section("questions", "Questions ouvertes", q, bullets(minutes.questions, C)) : ""}
  ${
    people.length
      ? `<tr><td style="padding:28px 32px 0 32px;"><div style="${F}font-size:13px;font-weight:600;color:${C.muted};margin-bottom:10px;">${ico("users", 14, 5)}PARTICIPANTS</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>`
      : ""
  }
  <tr><td align="center" style="padding:20px 32px 8px 32px;">
    <a href="${esc(ctx.link)}" style="display:inline-block;background:${C.main};color:#ffffff;${F}font-size:15px;font-weight:600;text-decoration:none;padding:13px 26px;border-radius:999px;">Ouvrir le compte rendu complet</a>
  </td></tr>
  ${signature}
</table>
</td></tr></table>
</body></html>`;
}
