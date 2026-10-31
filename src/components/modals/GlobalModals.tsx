import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { listen } from '@tauri-apps/api/event'
import { snapshot } from '../../store'
import { DragonTigerDrawer } from '../dragon_tiger/DragonTigerDrawer'
import { MiniTradeDrawer } from '../portfolio/MiniTradeDrawer'
import { CostAlertModal } from './CostAlertModal'
import { QuickAddModal } from './QuickAddModal'

export function GlobalModals() {
  const [tradeCode, setTradeCode] = createSignal<string | null>(null)
  const [tradePrice, setTradePrice] = createSignal<number | null>(null)
  const [costAlertCode, setCostAlertCode] = createSignal<string | null>(null)
  const [showQuickAdd, setShowQuickAdd] = createSignal(false)
  const [dragonTigerCode, setDragonTigerCode] = createSignal<string | null>(null)

  const s = () => snapshot()
  const tradeQuote = () => {
    const code = tradeCode()
    if (!code) return null
    return s()?.quotes.find((q) => q.code === code) ?? null
  }

  onMount(() => {
    const unlisteners: (() => void)[] = []

    listen<{ code?: string; price?: number }>('trigger-open-trade', (evt) => {
      if (!s()?.config.enablePortfolio) return
      if (evt.payload?.code) {
        setTradeCode(evt.payload.code)
        setTradePrice(evt.payload.price ?? null)
      }
    }).then((fn) => unlisteners.push(fn)).catch(() => {})

    listen<{ code?: string }>('open-cost-alert-modal', (evt) => {
      if (evt.payload?.code) {
        setCostAlertCode(evt.payload.code)
      }
    }).then((fn) => unlisteners.push(fn)).catch(() => {})

    listen('open-quick-add-modal', () => {
      setShowQuickAdd(true)
    }).then((fn) => unlisteners.push(fn)).catch(() => {})

    listen<{ code?: string }>('open-dragon-tiger-drawer', (evt) => {
      if (evt.payload?.code) {
        setDragonTigerCode(evt.payload.code)
      }
    }).then((fn) => unlisteners.push(fn)).catch(() => {})

    onCleanup(() => {
      unlisteners.forEach((fn) => fn())
    })
  })

  return (
    <>
      <Show when={tradeQuote()}>
        {(q) => (
          <MiniTradeDrawer
            code={q().code}
            name={q().name}
            currentPrice={q().price}
            initialPrice={tradePrice() ?? q().price}
            bids={q().bids}
            asks={q().asks}
            preClose={q().preClose}
            onClose={() => {
              setTradeCode(null)
              setTradePrice(null)
            }}
            onTradeSuccess={() => {
              setTradeCode(null)
              setTradePrice(null)
            }}
          />
        )}
      </Show>

      <Show when={costAlertCode()}>
        {(code) => (
          <CostAlertModal
            code={code()}
            onClose={() => setCostAlertCode(null)}
          />
        )}
      </Show>

      <Show when={showQuickAdd()}>
        <QuickAddModal onClose={() => setShowQuickAdd(false)} />
      </Show>

      <Show when={dragonTigerCode()}>
        {(code) => (
          <DragonTigerDrawer
            code={code()}
            name={s()?.quotes.find((q) => q.code === code())?.name}
            onClose={() => setDragonTigerCode(null)}
          />
        )}
      </Show>
    </>
  )
}
