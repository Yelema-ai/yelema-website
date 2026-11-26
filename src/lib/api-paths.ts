// The app's own API addresses built from ids an instance or the back office handed out (a routine's id is
// whatever jobs.json says): each id is one encoded segment, so « ../ » or « ? » never reaches another route.

// « . », « .. » and an empty id would still walk up a level once encoded: they name nothing.
const seg = (id: string): string => (/^\.{0,2}$/.test(id) ? "_" : encodeURIComponent(id));

/** A chat session of an instance; `q` is the profile query (`?profile=…` or empty). */
export const sessionPath = (agentId: string, sessionId: string, q = "", action = ""): string =>
  `/api/agents/${agentId}/chat/sessions/${seg(sessionId)}${action ? `/${action}` : ""}${q}`;

/** A turn of an instance: `cancel`, `steer`, `stream` or `approval`. */
export const responsePath = (agentId: string, responseId: string, action: string): string =>
  `/api/agents/${agentId}/chat/responses/${seg(responseId)}/${action}`;

/** A routine of an instance, or one of its actions (`run`, `runs`). */
export const routinePath = (agentId: string, routineId: string, action = ""): string =>
  `/api/agents/${agentId}/routines/${seg(routineId)}${action ? `/${action}` : ""}`;

/** An e-mail of an expert's inbox, or what hangs under it (`frame`, `reply`, `attachments/<id>`). */
export const mailMessagePath = (expert: string, messageId: string, ...rest: string[]): string =>
  [`/api/mail/${seg(expert)}/messages/${seg(messageId)}`, ...rest.map(seg)].join("/");

/** A salon of the relay (its id is the relay's), or what hangs under it (`membres`, `guests`, `livrables`). */
export const salonPath = (salonId: string, action = ""): string => `/api/buzz/salons/${seg(salonId)}${action ? `/${action}` : ""}`;
