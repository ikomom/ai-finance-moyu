import { createSignal, onMount, Show } from 'solid-js'
import type { MemoryManifest } from '../../types/agent'
import { fetchMemoryManifest, saveMemoryMutation } from '../../services/agent'
import { Badge, Button, Card } from '../ui'

export function MemoryTab() {
  const [manifest, setManifest] = createSignal<MemoryManifest | null>(null)
  const [activeSubTab, setActiveSubTab] = createSignal<'user' | 'memory' | 'soul'>('user')
  const [userDraft, setUserDraft] = createSignal('')
  const [memoryDraft, setMemoryDraft] = createSignal('')
  const [statusMsg, setStatusMsg] = createSignal('')
  const [isSaving, setIsSaving] = createSignal(false)

  const reload = async () => {
    const data = await fetchMemoryManifest()
    if (data) {
      setManifest(data)
      setUserDraft(data.user_md)
      setMemoryDraft(data.memory_md)
    }
  }

  onMount(reload)

  const handleSave = async () => {
    const current = manifest()
    if (!current) return
    setIsSaving(true)
    setStatusMsg('正在保存记忆文件...')

    try {
      if (activeSubTab() === 'user') {
        await saveMemoryMutation({
          target: 'USER',
          action: 'REPLACE_ALL',
          new_text: userDraft(),
        })
      } else if (activeSubTab() === 'memory') {
        await saveMemoryMutation({
          target: 'MEMORY',
          action: 'REPLACE_ALL',
          new_text: memoryDraft(),
        })
      }
      await reload()
      setStatusMsg('✅ 记忆已成功同步并原子刷盘！')
      setTimeout(() => setStatusMsg(''), 3000)
    } catch (err: any) {
      setStatusMsg(`❌ 保存失败: ${err?.message ?? err}`)
    } finally {
      setIsSaving(false)
    }
  }

  const currentChars = () => {
    if (activeSubTab() === 'user') return userDraft().length
    if (activeSubTab() === 'memory') return memoryDraft().length
    return manifest()?.soul_md.length ?? 0
  }

  const currentLimit = () => {
    if (activeSubTab() === 'user') return manifest()?.user_limit ?? 1500
    if (activeSubTab() === 'memory') return manifest()?.memory_limit ?? 2500
    return 4000
  }

  return (
    <div class="flex flex-col gap-4 text-slate-200">
      <div class="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <div>
          <h2 class="text-sm font-semibold text-white flex items-center gap-2">
            <span>🧠</span>
            <span>长期记忆与投资人画像</span>
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">
            借鉴 Inflection Pi 关系型认知架构与 Hermes 事实提取器，杜绝认知漂移
          </p>
        </div>
        <Show when={activeSubTab() !== 'soul'}>
          <Button variant="primary" size="sm" loading={isSaving()} onClick={handleSave}>
            保存记忆
          </Button>
        </Show>
      </div>

      <Card
        title="记忆分区文件"
        icon="📂"
        subtitle="查看并微调交易习惯画像与历史事实约束"
        action={
          <div class="flex items-center gap-2">
            <span class="text-[11px] text-slate-400">容量监控：</span>
            <Badge variant={currentChars() / currentLimit() > 0.85 ? 'danger' : 'accent'} size="sm">
              {currentChars()} / {currentLimit()} 字符
            </Badge>
          </div>
        }
      >
        <div class="flex items-center gap-2 border-b border-white/[0.08] pb-2">
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer"
            classList={{
              'active-subtab': activeSubTab() === 'user',
              'inactive-subtab': activeSubTab() !== 'user',
            }}
            onClick={() => setActiveSubTab('user')}
          >
            👤 交易员画像 (USER.md)
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer"
            classList={{
              'active-subtab': activeSubTab() === 'memory',
              'inactive-subtab': activeSubTab() !== 'memory',
            }}
            onClick={() => setActiveSubTab('memory')}
          >
            📝 事实备忘 (MEMORY.md)
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer"
            classList={{
              'active-subtab': activeSubTab() === 'soul',
              'inactive-subtab': activeSubTab() !== 'soul',
            }}
            onClick={() => setActiveSubTab('soul')}
          >
            ⚓ 人格原则 (SOUL.md)
          </button>
        </div>

        <div class="w-full">
          <Show when={activeSubTab() === 'user'}>
            <textarea
              class="w-full h-56 bg-black/35 border border-white/10 rounded-lg p-3 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500/80 leading-relaxed resize-y"
              value={userDraft()}
              onInput={(e) => setUserDraft(e.currentTarget.value)}
              placeholder="定义您的风险承受度、核心仓位红线与操作习惯..."
            />
          </Show>

          <Show when={activeSubTab() === 'memory'}>
            <textarea
              class="w-full h-56 bg-black/35 border border-white/10 rounded-lg p-3 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500/80 leading-relaxed resize-y"
              value={memoryDraft()}
              onInput={(e) => setMemoryDraft(e.currentTarget.value)}
              placeholder="记录持仓标的的关键约束、被套止损约定与历史教训..."
            />
          </Show>

          <Show when={activeSubTab() === 'soul'}>
            <textarea
              class="w-full h-56 bg-black/45 border border-white/10 rounded-lg p-3 text-xs font-mono text-slate-400 leading-relaxed resize-y cursor-not-allowed opacity-85"
              readonly
              value={manifest()?.soul_md ?? ''}
            />
          </Show>
        </div>

        <div class="flex items-center justify-between pt-1">
          <Button variant="secondary" size="xs" onClick={reload}>
            🔄 重新拉取磁盘文件
          </Button>

          <Show when={statusMsg()}>
            <span class="text-xs text-emerald-400">{statusMsg()}</span>
          </Show>
        </div>
      </Card>

      <div class="text-[11px] text-slate-400 bg-sky-500/[0.06] border border-sky-500/20 p-2.5 rounded-lg flex items-center gap-2">
        <span>📌</span>
        <span>
          <strong>异步演化机制</strong>：后台事实提取工作流会在您完成对话后，自动从上下文识别您的交易承诺与风控习惯并精炼更新，您可随时在此手动矫正。
        </span>
      </div>
    </div>
  )
}
