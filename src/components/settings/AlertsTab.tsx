import { useSettings } from './SettingsContext'

export function AlertsTab() {
  const { form, setForm } = useSettings()

  return (
    <div class="tab-pane">
      {/* 1. 行情轮询频率 */}
      <div class="card">
        <div class="card-title-row">
          <h2>行情轮询频率</h2>
        </div>
        <p class="hint">非交易时段完全停止网络请求；休市与节假日自动降频以节省系统资源。</p>
        <div class="field">
          <label for="poll-quotes">最新报价刷新间隔（毫秒）</label>
          <input
            id="poll-quotes"
            type="number"
            min="1000"
            max="60000"
            step="500"
            value={form.pollQuotesMs}
            onInput={(e) => setForm('pollQuotesMs', Number(e.currentTarget.value))}
          />
        </div>
        <div class="field">
          <label for="poll-trend">分时走势刷新间隔（毫秒）</label>
          <input
            id="poll-trend"
            type="number"
            min="5000"
            max="600000"
            step="1000"
            value={form.pollTrendMs}
            onInput={(e) => setForm('pollTrendMs', Number(e.currentTarget.value))}
          />
        </div>
      </div>

      {/* 2. 异动告警与通知 */}
      <div class="card">
        <div class="card-title-row">
          <h2>异动告警与通知</h2>
        </div>
        <div class="field">
          <label for="alert-pct">全局涨跌提醒阈值（±%）</label>
          <input
            id="alert-pct"
            type="number"
            min="0.1"
            max="50"
            step="0.1"
            value={form.alertPct}
            onInput={(e) => setForm('alertPct', Number(e.currentTarget.value))}
          />
        </div>
        <label class="check">
          <input
            type="checkbox"
            checked={form.notifications}
            onChange={(e) => setForm('notifications', e.currentTarget.checked)}
          />
          <span>触发到价或大幅波动时弹出系统气泡通知（未勾选则仅边框柔和闪烁）</span>
        </label>
      </div>

      {/* 3. 盘口即时异动告警 */}
      <div class="card">
        <div class="card-title-row">
          <h2>盘口即时异动告警 (Real-time Anomaly)</h2>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;">
          <label class="check">
            <input
              type="checkbox"
              checked={form.anomalyAlerts?.rapidChange ?? true}
              onChange={(e) => setForm('anomalyAlerts', 'rapidChange', e.currentTarget.checked)}
            />
            <span>🚀 急速拉升 / 急速跳水提醒（短线 1~2 分钟涨跌速超过 ±1.5%）</span>
          </label>
          <label class="check">
            <input
              type="checkbox"
              checked={form.anomalyAlerts?.intradayExtremes ?? true}
              onChange={(e) => setForm('anomalyAlerts', 'intradayExtremes', e.currentTarget.checked)}
            />
            <span>📈 突破日内新高 / 跌破新低提醒（盘中刷新日内极值）</span>
          </label>
          <label class="check">
            <input
              type="checkbox"
              checked={form.anomalyAlerts?.volumeBurst ?? true}
              onChange={(e) => setForm('anomalyAlerts', 'volumeBurst', e.currentTarget.checked)}
            />
            <span>💥 盘口大单扫盘/砸盘提醒（短时间爆量 3 倍以上且有买卖推升打压）</span>
          </label>
          <label class="check">
            <input
              type="checkbox"
              checked={form.anomalyAlerts?.limitBoard ?? true}
              onChange={(e) => setForm('anomalyAlerts', 'limitBoard', e.currentTarget.checked)}
            />
            <span>🔴 涨跌停全周期监控（逼近/封板/封单松动预警/开板炸板/跌停翘板）</span>
          </label>
        </div>
      </div>

      {/* 4. 走势判断引擎 */}
      <div class="card">
        <div class="card-title-row">
          <h2>走势判断引擎 (Trend Engine)</h2>
        </div>
        <label class="check">
          <input
            type="checkbox"
            checked={form.trendEngine}
            onChange={(e) => setForm('trendEngine', e.currentTarget.checked)}
          />
          <span>启用本地分时走势判断（基于均线乖离、量价背离与突破回踩，实时诊断短线多空形态）</span>
        </label>
      </div>
    </div>
  )
}
