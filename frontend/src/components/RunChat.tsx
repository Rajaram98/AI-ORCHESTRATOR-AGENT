import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, Message, Run } from "../api";
import { groupMessagesIntoTurns } from "../utils/chatTurns";

type Props = {
  run: Run;
  seedUserText?: string;
  onRunUpdate?: (run: Run) => void;
};

function optimisticId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function RunChat({ run, seedUserText, onRunUpdate }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(false);
  const prevCountRef = useRef(0);

  const loadMessages = useCallback(
    () =>
      api.runs.messages(run.id).then((fetched) => {
        setMessages(fetched);
        setPending((prev) =>
          prev.filter((p) => !fetched.some((m) => m.id === p.id || (m.sender_type === "human" && m.content === p.content)))
        );
      }),
    [run.id]
  );

  useEffect(() => {
    loadMessages();
    const t = setInterval(() => {
      loadMessages();
      api.runs.get(run.id).then(onRunUpdate ?? (() => undefined));
    }, 2000);
    return () => clearInterval(t);
  }, [run.id, loadMessages, onRunUpdate]);

  const displayMessages = useMemo(() => {
    const merged = [...messages];
    if (seedUserText?.trim()) {
      const hasSeed = merged.some((m) => m.sender_type === "human" && m.content === seedUserText.trim());
      if (!hasSeed) {
        merged.push({
          id: optimisticId("seed"),
          content: seedUserText.trim(),
          sender_type: "human",
          channel: "run",
          thread_id: run.id,
          run_id: run.id,
          created_at: new Date().toISOString(),
          metadata: { kind: "task", turn: 1 },
        });
      }
    }
    for (const p of pending) {
      if (!merged.some((m) => m.id === p.id)) merged.push(p);
    }
    return merged.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [messages, pending, seedUserText, run.id]);

  const chatMessages = useMemo(() => messagesForRunChat(displayMessages), [displayMessages]);
  const turns = useMemo(() => groupMessagesIntoTurns(chatMessages), [chatMessages]);

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  useEffect(() => {
    const count = displayMessages.length;
    const grew = count > prevCountRef.current;
    prevCountRef.current = count;
    if (stickToBottom.current && grew) {
      scrollToBottom("auto");
    }
  }, [displayMessages.length]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    if (run.status === "running") {
      setError("Wait for the current run to finish.");
      return;
    }
    const nextTurn =
      Math.max(0, ...displayMessages.filter((m) => m.sender_type === "human").map((m) => m.metadata?.turn ?? 0)) + 1;
    const optimistic: Message = {
      id: optimisticId("human"),
      content: text,
      sender_type: "human",
      channel: "run",
      thread_id: run.id,
      run_id: run.id,
      created_at: new Date().toISOString(),
      metadata: { turn: nextTurn },
    };
    stickToBottom.current = true;
    setPending((prev) => [...prev, optimistic]);
    setDraft("");
    setSending(true);
    setError(null);
    requestAnimationFrame(() => scrollToBottom("smooth"));
    try {
      await api.runs.chat(run.id, text);
      await loadMessages();
      const updated = await api.runs.get(run.id);
      onRunUpdate?.(updated);
    } catch (err) {
      setPending((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(text);
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="run-chat">
      <div
        ref={scrollRef}
        className="run-chat-messages"
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          stickToBottom.current = nearBottom;
        }}
      >
        {turns.length === 0 && (
          <p className="run-chat-empty">Queue a run to start the conversation.</p>
        )}
        {turns.map((turn) => (
          <div key={`turn-${turn.turn}-${turn.user?.id ?? "nouser"}`} className="run-chat-turn">
            {turn.user && (
              <div className="run-chat-bubble run-chat-bubble--user">
                <p>{turn.user.content}</p>
              </div>
            )}
            {turn.agents.length > 0 ? (
              <div className="run-chat-bubble run-chat-bubble--assistant">
                <p>{turn.agents[0].content}</p>
              </div>
            ) : (
              turn.user &&
              run.status === "running" && (
                <div className="run-chat-bubble run-chat-bubble--assistant run-chat-typing">
                  <span className="run-chat-typing-dots">
                    <span />
                    <span />
                    <span />
                  </span>
                  Workflow running…
                </div>
              )
            )}
          </div>
        ))}
      </div>
      {error && <p className="run-chat-error">{error}</p>}
      <form
        className="run-chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage();
        }}
      >
        <textarea
          rows={2}
          placeholder={run.status === "running" ? "Run in progress…" : "Message the workflow…"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={sending || run.status === "running"}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage();
            }
          }}
        />
        <button
          className="btn"
          type="submit"
          disabled={sending || run.status === "running" || !draft.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}

/** Runs chat: user messages + one workflow final reply per turn (not per-agent). */
function messagesForRunChat(messages: Message[]): Message[] {
  const humans = messages.filter((m) => m.sender_type === "human");
  const finals = messages.filter((m) => m.metadata?.kind === "workflow_final");
  if (finals.length > 0) {
    return [...humans, ...finals].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }
  const turns = groupMessagesIntoTurns(messages);
  const fallback: Message[] = [...humans];
  for (const turn of turns) {
    if (turn.agents.length === 0) continue;
    const last = [...turn.agents].sort(
      (a, b) =>
        (b.metadata?.sequence ?? 0) - (a.metadata?.sequence ?? 0) ||
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
    fallback.push(last);
  }
  return fallback.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}
