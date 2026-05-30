import { Message } from "../api";

export type ChatTurn = {
  turn: number;
  user?: Message;
  agents: Message[];
};

function turnNumber(m: Message): number | undefined {
  const t = m.metadata?.turn;
  return typeof t === "number" ? t : undefined;
}

/** Group messages into Q/A turns using metadata.turn, with chronological fallback. */
export function groupMessagesIntoTurns(messages: Message[]): ChatTurn[] {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const humans = sorted.filter((m) => m.sender_type === "human");
  const agents = sorted.filter((m) => m.sender_type === "agent");

  if (humans.length === 0 && agents.length === 0) return [];

  const turnNums = new Set<number>();
  for (const m of sorted) {
    const t = turnNumber(m);
    if (t != null) turnNums.add(t);
  }
  for (let i = 0; i < humans.length; i++) {
    turnNums.add(turnNumber(humans[i]) ?? i + 1);
  }
  if (turnNums.size === 0) turnNums.add(1);

  const maxTurn = Math.max(...turnNums);

  const turns: ChatTurn[] = [];
  for (let t = 1; t <= maxTurn; t++) {
    const user =
      humans.find((m) => turnNumber(m) === t) ??
      (humans.length >= t ? humans[t - 1] : undefined);

    let turnAgents = agents.filter((m) => turnNumber(m) === t);

    if (turnAgents.length === 0 && user) {
      const userIdx = sorted.indexOf(user);
      const nextHumanIdx = sorted.findIndex(
        (m, i) => i > userIdx && m.sender_type === "human"
      );
      const end = nextHumanIdx === -1 ? sorted.length : nextHumanIdx;
      turnAgents = sorted
        .slice(userIdx + 1, end)
        .filter((m) => m.sender_type === "agent");
    }

    if (user || turnAgents.length > 0) {
      turns.push({ turn: t, user, agents: turnAgents });
    }
  }

  const assigned = new Set(turns.flatMap((t) => t.agents.map((a) => a.id)));
  const orphanAgents = agents.filter((a) => !assigned.has(a.id));
  if (orphanAgents.length > 0) {
    const last = turns[turns.length - 1];
    if (last) last.agents.push(...orphanAgents);
    else turns.push({ turn: maxTurn + 1, agents: orphanAgents });
  }

  const assignedHumans = new Set(turns.map((t) => t.user?.id).filter(Boolean));
  for (const h of humans) {
    if (!assignedHumans.has(h.id)) {
      turns.push({ turn: turnNumber(h) ?? turns.length + 1, user: h, agents: [] });
    }
  }

  turns.sort((a, b) => a.turn - b.turn);
  return turns;
}
