import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Loader2, MessageCircle, Plus, Send, Sparkles, UserRound } from 'lucide-react';
import { ApiError, type QndHealthApi } from './api';
import { coachActionLabel, conversationTitle, visibleCoachMessages } from './coach-view-model';
import type { CoachAction, CoachConversation, CoachMessage, CoachProviderErrorPayload } from './types';

interface CoachViewProps {
  api: QndHealthApi;
  onError: (message: string | null) => void;
}

function storedActions(message: CoachMessage): CoachAction[] {
  if (!message.toolMetadata || typeof message.toolMetadata !== 'object') return [];
  const actions = (message.toolMetadata as { actions?: unknown }).actions;
  if (!Array.isArray(actions)) return [];
  return actions.filter((action): action is CoachAction => {
    if (!action || typeof action !== 'object') return false;
    const candidate = action as Partial<CoachAction>;
    return typeof candidate.toolCallId === 'string' && typeof candidate.name === 'string' && candidate.status === 'completed';
  });
}

function messageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

function ConversationRail({ conversations, activeId, loading, onSelect, onCreate }: {
  conversations: CoachConversation[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  return <aside className="coach-rail">
    <div className="coach-rail-head">
      <div><span className="eyebrow">DeepSeek Flash</span><h2>AI Coach</h2></div>
      <button className="primary coach-new" type="button" onClick={onCreate} disabled={loading}><Plus size={15} /> Nowa rozmowa</button>
    </div>
    <div className="coach-conversation-list">
      {loading && conversations.length === 0 ? <div className="coach-rail-loading"><Loader2 className="spin" size={17} /> Wczytywanie…</div> : null}
      {!loading && conversations.length === 0 ? <div className="coach-rail-empty"><MessageCircle size={18} /><span>Brak zapisanych rozmów.</span></div> : null}
      {conversations.map(conversation => <button
        key={conversation.id}
        type="button"
        className={`coach-conversation ${conversation.id === activeId ? 'active' : ''}`}
        onClick={() => onSelect(conversation.id)}
      >
        <span className="coach-conversation-icon"><MessageCircle size={15} /></span>
        <span className="coach-conversation-copy">
          <strong>{conversationTitle(conversation.title, conversation.createdAt)}</strong>
          <small>{new Date(conversation.updatedAt).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}</small>
        </span>
      </button>)}
    </div>
    <div className="coach-rail-note"><Sparkles size={15} /><span>Coach może zmieniać cele, plan, żywienie i inne dane przez bezpieczne narzędzia QND Health.</span></div>
  </aside>;
}

function ActionChips({ actions }: { actions: CoachAction[] }) {
  if (actions.length === 0) return null;
  return <div className="coach-actions">{actions.map(action => <span className="coach-action" key={action.toolCallId}><CheckCircle2 size={13} /> {coachActionLabel(action)}</span>)}</div>;
}

export function CoachView({ api, onError }: CoachViewProps) {
  const [conversations, setConversations] = useState<CoachConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [localActions, setLocalActions] = useState<CoachAction[]>([]);
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const visibleMessages = useMemo(() => visibleCoachMessages(messages), [messages]);
  const activeConversation = useMemo(() => conversations.find(item => item.id === activeId) ?? null, [conversations, activeId]);

  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const response = await api.listCoachConversations();
      setConversations(response.conversations);
      setActiveId(current => current ?? response.conversations[0]?.id ?? null);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Nie udało się wczytać rozmów Coacha.');
    } finally {
      setLoadingConversations(false);
    }
  }, [api, onError]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    setChatNotice(null);
    try {
      const response = await api.getCoachMessages(conversationId);
      setMessages(response.messages);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Nie udało się wczytać rozmowy.');
    } finally {
      setLoadingMessages(false);
    }
  }, [api, onError]);

  useEffect(() => { void loadConversations(); }, [loadConversations]);
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    void loadMessages(activeId);
  }, [activeId, loadMessages]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [visibleMessages.length, sending]);

  async function createConversation() {
    if (sending) return;
    setChatNotice(null);
    try {
      const response = await api.createCoachConversation();
      setConversations(current => [response.conversation, ...current]);
      setActiveId(response.conversation.id);
      setMessages([]);
      setDraft('');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Nie udało się utworzyć rozmowy.');
    }
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!content || sending) return;

    let conversationId = activeId;
    if (!conversationId) {
      try {
        const response = await api.createCoachConversation();
        conversationId = response.conversation.id;
        setConversations(current => [response.conversation, ...current]);
        setActiveId(conversationId);
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Nie udało się rozpocząć rozmowy.');
        return;
      }
    }

    const optimistic: CoachMessage = {
      id: `local-${Date.now()}`,
      conversationId,
      role: 'user',
      content,
      model: null,
      toolMetadata: null,
      createdAt: new Date().toISOString(),
    };
    setMessages(current => [...current, optimistic]);
    setDraft('');
    setSending(true);
    setLocalActions([]);
    setChatNotice(null);
    onError(null);

    try {
      const response = await api.sendCoachMessage(conversationId, content);
      setLocalActions(response.actions);
      await Promise.all([loadMessages(conversationId), loadConversations()]);
    } catch (error) {
      if (error instanceof ApiError) {
        const payload = (error.data ?? {}) as CoachProviderErrorPayload;
        const actions = payload.completedActions ?? [];
        if (actions.length > 0) {
          setLocalActions(actions);
          setChatNotice('Coach wykonał poniższe zmiany, ale nie zdążył wygenerować końcowej odpowiedzi.');
          await loadMessages(conversationId);
        } else if (error.status === 503) {
          setChatNotice('DeepSeek nie jest jeszcze skonfigurowany na serwerze. Dodaj DEEPSEEK_API_KEY w .env i uruchom update.sh.');
        } else {
          setChatNotice(error.message);
        }
      } else {
        setChatNotice(error instanceof Error ? error.message : 'Coach nie odpowiedział.');
      }
    } finally {
      setSending(false);
    }
  }

  return <section className="coach-view">
    <ConversationRail conversations={conversations} activeId={activeId} loading={loadingConversations} onSelect={setActiveId} onCreate={() => void createConversation()} />
    <div className="coach-chat panel">
      <header className="coach-chat-head">
        <div><span className="eyebrow">Profesjonalny trener</span><h1>{activeConversation ? conversationTitle(activeConversation.title, activeConversation.createdAt) : 'AI Coach'}</h1><p>Surowo, sprawiedliwie i na podstawie Twoich danych.</p></div>
        <span className="coach-model"><span /> deepseek-flash</span>
      </header>

      <div className="coach-messages" aria-live="polite">
        {!activeId ? <div className="coach-empty-state"><div className="coach-empty-icon"><Bot size={25} /></div><h2>Wybierz rozmowę albo zacznij nową</h2><p>Możesz poprosić Coacha o ocenę dnia, zmianę celu, dodanie aktywności, poprawę planu albo analizę postępów.</p><div className="coach-suggestions"><button type="button" onClick={() => setDraft('Oceń mój dzisiejszy dzień i powiedz, co poprawić.')}>Oceń dzisiejszy dzień</button><button type="button" onClick={() => setDraft('Sprawdź mój plan na jutro i oceń, czy jest rozsądny.')}>Sprawdź plan na jutro</button><button type="button" onClick={() => setDraft('Przeanalizuj moje ostatnie 7 dni.')}>Przeanalizuj 7 dni</button></div></div> : null}
        {activeId && loadingMessages ? <div className="coach-loading"><Loader2 className="spin" size={19} /> Wczytywanie rozmowy…</div> : null}
        {activeId && !loadingMessages && visibleMessages.length === 0 ? <div className="coach-empty-state compact"><div className="coach-empty-icon"><Sparkles size={22} /></div><h2>Nowa rozmowa</h2><p>Napisz, czego potrzebujesz. Jasne polecenia dotyczące celów i planu Coach może wykonać od razu.</p></div> : null}
        {visibleMessages.map(message => {
          const actions = message.role === 'assistant' ? storedActions(message) : [];
          return <article className={`coach-message ${message.role}`} key={message.id}>
            <div className="coach-avatar">{message.role === 'assistant' ? <Bot size={16} /> : <UserRound size={16} />}</div>
            <div className="coach-bubble"><div className="coach-message-meta"><strong>{message.role === 'assistant' ? 'Coach' : 'Ty'}</strong><span>{messageTime(message.createdAt)}</span></div><p>{message.content}</p><ActionChips actions={actions} /></div>
          </article>;
        })}
        {sending ? <article className="coach-message assistant"><div className="coach-avatar"><Bot size={16} /></div><div className="coach-bubble coach-thinking"><Loader2 className="spin" size={15} /><span>Analizuję dane i plan…</span></div></article> : null}
        {chatNotice ? <div className="coach-notice"><AlertTriangle size={15} /><span>{chatNotice}</span></div> : null}
        <ActionChips actions={localActions} />
        <div ref={endRef} />
      </div>

      <div className="coach-composer">
        <textarea
          rows={2}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          placeholder="Np. ustaw mi jutro 8000 kroków i dodaj 30 minut spaceru…"
          disabled={sending}
        />
        <button className="primary coach-send" type="button" onClick={() => void sendMessage()} disabled={!draft.trim() || sending} aria-label="Wyślij wiadomość"><Send size={17} /></button>
        <small>Enter wysyła · Shift+Enter dodaje nową linię. Zmiany wykonane przez Coacha trafiają do audytu.</small>
      </div>
    </div>
  </section>;
}
