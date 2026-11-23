import "server-only";
import { branding } from "@/config/branding";
import { ApiError } from "@/lib/http";
import { companyContacts, recipientsOf, type CompanyDirectory, type SendOptions, type SendRequest } from "./audience";
import type { MeetingScope } from "./drive";
import { minutesEmail, type MinutesEmail } from "./email";
import { minutesEmailHtml } from "./email-html";
import { logFailure } from "./log";
import { newId, updateRecord, writtenMeeting, type WrittenMeeting } from "./meeting-store";
import { withDelivery, type Delivery, type MeetingRecord } from "./record";
import { MAIL_TOOLKITS, type ConnectedMailbox, type ExpertMailbox, type SendResult, type SenderOptions } from "./senders";
import { meetingStatus, meetingView, pendingExpired, type MeetingView } from "./view";

export interface SendPorts {
  me: string | null;
  origin: string;
  company: () => Promise<CompanyDirectory>;
  senders: () => Promise<SenderOptions>;
  sendFromExpert: (expert: string, to: string[], email: MinutesEmail) => Promise<SendResult>;
  sendFromConnected: (account: ConnectedMailbox, to: string[], email: MinutesEmail) => Promise<SendResult>;
}

type ChosenSender = { kind: "expert"; expert: ExpertMailbox } | { kind: "connected"; account: ConnectedMailbox };

const INTERRUPTED = "L’envoi a été interrompu. Vérifiez la boîte d’envoi avant de renvoyer.";

const failed = (record: MeetingRecord, reason: string, at: string): MeetingRecord => ({ ...record, pending: null, lastFailure: { at, reason } });

function chosenSender(request: SendRequest, options: SenderOptions): ChosenSender {
  if (request.sender.kind === "expert") {
    if (!options.expert?.canSend) throw new ApiError(403, "forbidden", "Vous ne pouvez pas envoyer depuis cette boîte e-mail.");
    return { kind: "expert", expert: options.expert };
  }
  const wanted = request.sender.account;
  const account = options.connected.find((c) => c.id === wanted);
  if (!account) throw new ApiError(404, "not_found", "Ce compte e-mail n’est plus connecté.");
  return { kind: "connected", account };
}

const senderAddress = (sender: ChosenSender): string => (sender.kind === "expert" ? sender.expert.address : sender.account.email);

export async function settleDelivery(scope: MeetingScope, folder: string, record: MeetingRecord): Promise<MeetingRecord> {
  const pending = record.pending;
  if (!pending || !pendingExpired(record, Date.now())) return record;
  const result = await updateRecord(scope, folder, (r) => (r.pending?.id === pending.id ? failed(r, INTERRUPTED, new Date().toISOString()) : null));
  return result?.record ?? record;
}

async function settledMeeting(scope: MeetingScope, id: string): Promise<WrittenMeeting> {
  const written = await writtenMeeting(scope, id);
  return written.minutes ? { ...written, record: await settleDelivery(scope, written.folder, written.record) } : written;
}

export async function sendMinutes(scope: MeetingScope, id: string, request: SendRequest, ports: SendPorts): Promise<MeetingView> {
  const { folder, record: stored, minutes } = await settledMeeting(scope, id);
  if (!minutes) throw new ApiError(409, "not_ready", "Le compte rendu n’est pas encore prêt.");
  if (meetingStatus(stored, minutes, Date.now()) === "sending") throw new ApiError(409, "sending", "Un envoi est déjà en cours.");

  const sender = chosenSender(request, await ports.senders());
  const participants = minutes.contacts.map((c) => c.email);
  const recipients = recipientsOf(request.audience, {
    me: ports.me,
    company: request.audience.company ? companyContacts(participants, await ports.company()) : [],
    participants,
  });
  if (!recipients.ok) {
    throw recipients.reason === "none"
      ? new ApiError(400, "no_recipient", "Choisissez au moins un destinataire.")
      : new ApiError(400, "too_many", "Cinquante destinataires au plus par envoi.");
  }

  if (!stored.frame) throw new ApiError(409, "not_published", "La page du compte rendu n’est pas encore publiée.");
  const email: MinutesEmail = {
    ...minutesEmail(minutes, stored.byline, stored.frame.url),
    html: minutesEmailHtml(minutes, stored, {
      link: stored.frame.url,
      origin: ports.origin,
      timeZone: request.timeZone,
      appName: branding.appName,
      from: sender.kind === "expert" ? sender.expert.address : null,
    }),
  };
  const delivery: Delivery = {
    id: newId(),
    at: new Date().toISOString(),
    sender: request.sender.kind,
    from: senderAddress(sender),
    to: recipients.to,
  };

  const claim = await updateRecord(scope, folder, (r) => (r.phase === "writing" && (!r.pending || pendingExpired(r, Date.now())) ? { ...r, pending: delivery } : null));
  if (!claim?.changed) throw new ApiError(409, "sending", "Un envoi est déjà en cours.");

  const result =
    sender.kind === "expert" ? await ports.sendFromExpert(sender.expert.expert, delivery.to, email) : await ports.sendFromConnected(sender.account, delivery.to, email);
  const at = new Date().toISOString();
  const done = await updateRecord(scope, folder, (r) => {
    if (r.pending?.id !== delivery.id) return null;
    const sent = result.sent.length ? withDelivery(r, { ...delivery, at, from: result.from ?? delivery.from, to: result.sent }) : r;
    return result.failure ? failed(sent, result.failure.message, at) : { ...sent, pending: null };
  });
  if (result.failure && !result.sent.length) throw result.failure;
  return meetingView(done?.record ?? claim.record, minutes, Date.now());
}

export async function sendOptions(scope: MeetingScope, id: string, ports: SendPorts): Promise<SendOptions> {
  const { minutes } = await settledMeeting(scope, id);
  if (!minutes) throw new ApiError(409, "not_ready", "Le compte rendu n’est pas encore prêt.");
  const participants = minutes.contacts.map((c) => c.email);
  const [senders, company] = await Promise.all([
    ports.senders(),
    participants.length
      ? ports.company().then(
          (directory) => companyContacts(participants, directory),
          (e) => {
            logFailure("company directory", e);
            return [];
          }
        )
      : Promise.resolve([]),
  ]);
  return {
    expert: senders.expert ? { address: senders.expert.address, canSend: senders.expert.canSend, externalAllowed: senders.expert.externalAllowed } : null,
    connected: senders.connected.map((c) => ({ id: c.id, label: MAIL_TOOLKITS[c.toolkit], email: c.email })),
    me: ports.me,
    company,
  };
}
