import { createSignal, onMount, onCleanup } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AgentMessage, ChatSession, ChatSessionSummary, LlmProfile } from '../../types/agent'
import {
  chatWithAgent,
  deleteChatSession,
  fetchAgentConfig,
  fetchChatSession,
  fetchChatSessions,
  saveChatSession,
  setActiveProfile,
} from '../../services/agent'
import { MessageList } from '../agent/MessageList'
import { CapsuleBar } from '../agent/CapsuleBar'
import { InputBox } from '../agent/InputBox'
import { CopilotHeader, type StockQuoteBrief } from './CopilotHeader'
import { CopilotSidebar } from './CopilotSidebar'
import { attachCopilotStream } from './useCopilotStream'
import { loadWatchlistQuotes, makeSession } from './copilotSession'
import './Copilot.css'

export function CopilotApp() {
  const [sessions, setSessions] = createSignal<ChatSessionSummary[]>([])
  const [currentSessionId, setCurrentSessionId] = createSignal<string | null>(null)
  /** Creation timestamp of the open session, preserved across saves. */
  const [sessionCreatedAt, setSessionCreatedAt] = createSignal<number | null>(null)
  const [messages, setMessages] = createSignal<AgentMessage[]>([])
  const [activeSymbol, setActiveSymbol] = createSignal<string | null>(null)
  const [activeName, setActiveName] = createSignal<string | null>(null)
  const [watchlist, setWatchlist] = createSignal<Array<{ code: string; name: string }>>([])
  const [quotes, setQuotes] = createSignal<Record<string, StockQuoteBrief>>({})
  const [isStreaming, setIsStreaming] = createSignal(false)
  const [isSidebarOpen, setIsSidebarOpen] = createSignal(true)
  const [filterCurrentOnly, setFilterCurrentOnly] = createSignal(false)
  /** Configured providers, mirrored from settings so the dropdown can be shown. */
  const [profiles, setProfiles] = createSignal<LlmProfile[]>([])
  const [activeProfileId, setActiveProfileId] = createSignal('')

  let unlistenSymbol: UnlistenFn | undefined
  let unlistenSnap: UnlistenFn | undefined
  let unlistenStream: (() => void) | undefined
  /** Session that owns the in-flight stream; `null` when nothing is running. */
  let streamSessionId: string | null = null

  const reloadSessions = async () => {
    const list = await fetchChatSessions()
    setSessions(list)
    return list
  }

  const createNewSession = (sym?: string | null, name?: string | null): ChatSession =>
    makeSession(sym ?? activeSymbol(), name ?? activeName())

  const switchSession = async (id: string) => {
    const sess = await fetchChatSession(id)
    if (sess) {
      setCurrentSessionId(sess.id)
      setSessionCreatedAt(sess.created_at)
      setMessages(sess.messages)
      if (sess.symbol) setActiveSymbol(sess.symbol)
      if (sess.symbol_name) setActiveName(sess.symbol_name)
    }
  }

  const initWatchlist = async () => {
    try {
      const loaded = await loadWatchlistQuotes()
      setQuotes(loaded.quotes)
      setWatchlist(loaded.watchlist)
      if (!activeSymbol() && loaded.firstSymbol) {
        setActiveSymbol(loaded.firstSymbol)
        setActiveName(loaded.firstName)
      }
    } catch (err) {
      console.error('Failed to init watchlist:', err)
    }
  }

  /** Mirror the provider list so the header dropdown reflects settings edits. */
  const initProfiles = async () => {
    const cfg = await fetchAgentConfig()
    setProfiles(cfg.profiles ?? [])
    setActiveProfileId(cfg.active_profile_id ?? '')
  }

  const persistCurrentSession = async () => {
    const sessId = currentSessionId()
    if (!sessId) return
    const curMessages = messages()
    const firstUserMsg = curMessages.find((m) => m.role === 'user')
    const title = activeName()
      ? `${activeName()} · ${firstUserMsg?.content.slice(0, 14) ?? '复盘推演'}`
      : firstUserMsg?.content.slice(0, 18) ?? '宏观复盘'

    const sess: ChatSession = {
      id: sessId,
      title,
      symbol: activeSymbol() ?? undefined,
      symbol_name: activeName() ?? undefined,
      // `created_at` belongs to the session, not to the save: overwriting it on
      // every save made every conversation look brand new.
      created_at: sessionCreatedAt() ?? Date.now(),
      updated_at: Date.now(),
      messages: curMessages,
    }

    await saveChatSession(sess)
    await reloadSessions()
  }

  onMount(async () => {
    await Promise.all([initWatchlist(), initProfiles()])
    const list = await reloadSessions()

    if (list.length > 0) {
      await switchSession(list[0].id)
    } else {
      const fresh = createNewSession()
      setCurrentSessionId(fresh.id)
      setSessionCreatedAt(fresh.created_at)
      await saveChatSession(fresh)
      await reloadSessions()
    }

    unlistenSymbol = await listen<string>('copilot://select-symbol', async (event) => {
      const sym = event.payload
      if (!sym) return
      const matched = watchlist().find((w) => w.code.toLowerCase() === sym.toLowerCase())
      const name = matched ? matched.name : sym
      setActiveSymbol(sym)
      setActiveName(name)

      if (messages().length === 0) {
        const fresh = createNewSession(sym, name)
        setCurrentSessionId(fresh.id)
        setSessionCreatedAt(fresh.created_at)
        await saveChatSession(fresh)
        await reloadSessions()
      }
    })

    unlistenSnap = await listen<any>('snapshot', (ev) => {
      const snap = ev.payload
      if (snap?.quotes) {
        // Merge, don't replace: the polled snapshot carries price/change only,
        // and replacing the map dropped every cached display name.
        setQuotes((prev) => {
          const next: Record<string, StockQuoteBrief> = { ...prev }
          for (const q of snap.quotes) {
            next[q.code] = { ...next[q.code], price: q.price, changePct: q.changePct }
          }
          return next
        })
      }
    })

    // A stream started in one session must not leak into another.
    unlistenStream = await attachCopilotStream(
      setMessages,
      setIsStreaming,
      persistCurrentSession,
      () => !streamSessionId || streamSessionId === currentSessionId()
    )
  })

  onCleanup(() => {
    if (unlistenSymbol) unlistenSymbol()
    if (unlistenSnap) unlistenSnap()
    if (unlistenStream) unlistenStream()
  })

  const handleSend = async (text: string) => {
    if (isStreaming()) return
    const sym = activeSymbol()
    const userMsg: AgentMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      symbol: sym ?? undefined,
    }

    const assistantMsg: AgentMessage = {
      id: `a_${Date.now()}`,
      role: 'assistant',
      content: '',
      thought: '',
      timestamp: Date.now(),
      isStreaming: true,
      symbol: sym ?? undefined,
    }

    const updatedHistory = [...messages(), userMsg]
    setMessages([...updatedHistory, assistantMsg])
    setIsStreaming(true)
    // Pin the stream to the session that started it; see `attachCopilotStream`.
    streamSessionId = currentSessionId()

    try {
      const res = await chatWithAgent(text, sym ?? undefined, updatedHistory)
      if (res) {
        setMessages((prev) => {
          const lastIdx = prev.length - 1
          const last = prev[lastIdx]
          if (last && last.role === 'assistant') {
            return [...prev.slice(0, lastIdx), { ...last, content: res, isStreaming: false }]
          }
          return prev
        })
        setIsStreaming(false)
        // Persistence is owned by the `agent://done` handler; writing here too
        // saved every conversation twice.
      }
    } catch (e: any) {
      setMessages((prev) => {
        const lastIdx = prev.length - 1
        const last = prev[lastIdx]
        if (last && last.role === 'assistant') {
          return [
            ...prev.slice(0, lastIdx),
            { ...last, content: `### ⚠️ 推演异常\n\n${e?.message ?? e}`, isStreaming: false },
          ]
        }
        return prev
      })
      setIsStreaming(false)
    }
  }

  return (
    <div class="copilot-layout">
      <CopilotSidebar
        sessions={sessions()}
        currentSessionId={currentSessionId()}
        activeSymbol={activeSymbol()}
        activeName={activeName()}
        filterCurrentOnly={filterCurrentOnly()}
        onToggleFilter={() => setFilterCurrentOnly(!filterCurrentOnly())}
        onSelectSession={switchSession}
        onNewSession={async () => {
          const fresh = createNewSession()
          setCurrentSessionId(fresh.id)
          setMessages([])
          await saveChatSession(fresh)
          await reloadSessions()
        }}
        onDeleteSession={async (id) => {
          await deleteChatSession(id)
          const list = await reloadSessions()
          if (currentSessionId() === id) {
            if (list.length > 0) await switchSession(list[0].id)
            else setMessages([])
          }
        }}
        isOpen={isSidebarOpen()}
      />

      <main class="copilot-main">
        <CopilotHeader
          activeSymbol={activeSymbol()}
          activeName={activeName()}
          watchlist={watchlist()}
          quotes={quotes()}
          onSelectSymbol={(sym, name) => {
            setActiveSymbol(sym)
            setActiveName(name)
          }}
          isSidebarOpen={isSidebarOpen()}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen())}
          onOpenSettings={() => invoke('open_settings_window')}
          onClearSession={() => setMessages([])}
          profiles={profiles()}
          activeProfileId={activeProfileId()}
          onSelectProfile={async (id) => {
            const cfg = await setActiveProfile(id)
            setProfiles(cfg.profiles ?? [])
            setActiveProfileId(cfg.active_profile_id)
          }}
        />

        <div class="copilot-chat-pane">
          <MessageList
            messages={messages()}
            activeSymbol={activeSymbol() ?? undefined}
            activeName={activeName() ?? undefined}
          />
        </div>

        <footer class="copilot-footer">
          <CapsuleBar onSelect={handleSend} disabled={isStreaming()} />
          <InputBox onSend={handleSend} isStreaming={isStreaming()} />
        </footer>
      </main>
    </div>
  )
}
