use super::types::*;

/// Calculate rolling MA5, MA10, MA20, MACD(12, 26, 9), KDJ(9, 3, 3), and support/resistance.
pub fn compute_kline_indicators(code: &str, mut bars: Vec<KLineBar>) -> KLineData {
    let closes: Vec<f64> = bars.iter().map(|b| b.close).collect();
    for (i, bar) in bars.iter_mut().enumerate() {
        if i >= 4 {
            let sum: f64 = closes[i + 1 - 5..=i].iter().sum();
            bar.ma5 = Some((sum / 5.0 * 100.0).round() / 100.0);
        }
        if i >= 9 {
            let sum: f64 = closes[i + 1 - 10..=i].iter().sum();
            bar.ma10 = Some((sum / 10.0 * 100.0).round() / 100.0);
        }
        if i >= 19 {
            let sum: f64 = closes[i + 1 - 20..=i].iter().sum();
            bar.ma20 = Some((sum / 20.0 * 100.0).round() / 100.0);
        }
    }

    // MACD(12, 26, 9) standard exponential moving average recursion
    if let Some(first) = bars.first() {
        let mut ema12 = first.close;
        let mut ema26 = first.close;
        let mut dea = 0.0;

        for (i, bar) in bars.iter_mut().enumerate() {
            let c = bar.close;
            if i == 0 {
                ema12 = c;
                ema26 = c;
                dea = 0.0;
                bar.dif = Some(0.0);
                bar.dea = Some(0.0);
                bar.macd = Some(0.0);
            } else {
                ema12 = ema12 * (11.0 / 13.0) + c * (2.0 / 13.0);
                ema26 = ema26 * (25.0 / 27.0) + c * (2.0 / 27.0);
                let dif = ema12 - ema26;
                dea = dea * (8.0 / 10.0) + dif * (2.0 / 10.0);
                let macd_hist = (dif - dea) * 2.0;

                bar.dif = Some((dif * 1000.0).round() / 1000.0);
                bar.dea = Some((dea * 1000.0).round() / 1000.0);
                bar.macd = Some((macd_hist * 1000.0).round() / 1000.0);
            }
        }
    }

    // KDJ(9, 3, 3) standard recursion (pure background computation, no subchart curve)
    let n = bars.len();
    let mut prev_k = 50.0;
    let mut prev_d = 50.0;
    let mut second_last_k = 50.0;
    let mut second_last_d = 50.0;

    for i in 0..n {
        let start = i.saturating_sub(8);
        let window = &bars[start..=i];
        let mut lowest = f64::MAX;
        let mut highest = f64::MIN;
        for b in window {
            if b.low < lowest { lowest = b.low; }
            if b.high > highest { highest = b.high; }
        }

        let c = bars[i].close;
        let rsv = if (highest - lowest).abs() < 1e-6 {
            50.0
        } else {
            ((c - lowest) / (highest - lowest) * 100.0).clamp(0.0, 100.0)
        };

        let k = (2.0 / 3.0) * prev_k + (1.0 / 3.0) * rsv;
        let d = (2.0 / 3.0) * prev_d + (1.0 / 3.0) * k;
        let j = 3.0 * k - 2.0 * d;

        bars[i].k = Some((k * 10.0).round() / 10.0);
        bars[i].d = Some((d * 10.0).round() / 10.0);
        bars[i].j = Some((j * 10.0).round() / 10.0);

        if i + 1 == n {
            second_last_k = prev_k;
            second_last_d = prev_d;
        }
        prev_k = k;
        prev_d = d;
    }

    // Rolling 5-day support & resistance
    let (support, resistance) = if n >= 2 {
        let start = n.saturating_sub(6);
        let end = n - 1; // Prior 5 trading days
        let mut res = f64::MIN;
        let mut sup = f64::MAX;
        for b in &bars[start..end] {
            if b.high > res { res = b.high; }
            if b.low < sup { sup = b.low; }
        }
        (
            if sup == f64::MAX { None } else { Some((sup * 100.0).round() / 100.0) },
            if res == f64::MIN { None } else { Some((res * 100.0).round() / 100.0) },
        )
    } else {
        (None, None)
    };

    // Diagnostic synthesis
    let last = bars.last();
    let kdj_status = last.and_then(|l| {
        match (l.k, l.d, l.j) {
            (Some(k), Some(d), Some(j)) => {
                if j > 100.0 {
                    Some("日线超买 J>100".to_string())
                } else if j < 10.0 {
                    Some("日线超卖 J<10".to_string())
                } else if k > d && second_last_k <= second_last_d {
                    Some("低位金叉".to_string())
                } else if k < d && second_last_k >= second_last_d {
                    Some("高位死叉".to_string())
                } else {
                    Some(format!("K:{:.0} D:{:.0} J:{:.0}", k, d, j))
                }
            }
            _ => None,
        }
    });

    let (ma_signal, ma_comment, kline_action, kline_tone) = if let Some(last_bar) = last {
        let c = last_bar.close;
        let j_val = last_bar.j.unwrap_or(50.0);

        match (last_bar.ma5, last_bar.ma10, last_bar.ma20) {
            (Some(m5), Some(m10), Some(m20)) => {
                if m5 > m10 && m10 > m20 && c >= m5 {
                    if j_val > 100.0 {
                        ("bull_aligned", format!("日线多头但短线 J>{:.0} 严重超买，谨防冲高回落", j_val), "逢高止盈", "warn")
                    } else {
                        ("bull_aligned", format!("站稳 MA5 ({:.2}) 均线多头排列，量价支撑坚挺", m5), "顺势看多", "bull")
                    }
                } else if c >= m20 && m5 >= m20 {
                    if c < m5 {
                        ("above_ma20", format!("良性回踩 MA5 ({:.2})，下方生命线 MA20 ({:.2}) 承托", m5, m20), "观察支撑", "bull")
                    } else {
                        ("above_ma20", format!("稳于生命线 MA20 ({:.2}) 上方，均线呈良性上行通道", m20), "持股待涨", "bull")
                    }
                } else if m5 < m10 && m10 < m20 && c <= m5 {
                    if j_val < 10.0 {
                        ("bear_aligned", format!("空头承压但日线 J<{:.0} 极度超卖，严防地板盲目杀跌", j_val), "谨防杀跌", "neutral")
                    } else {
                        ("bear_aligned", format!("日线呈空头排列，价格受制于 MA5 ({:.2})，严守止损纪律", m5), "严格止损", "bear")
                    }
                } else if c < m20 {
                    ("below_ma20", format!("跌破生命线 MA20 ({:.2})，短线反抽承压偏弱，以防守为主", m20), "防守控仓", "bear")
                } else {
                    ("neutral", format!("价格在均线密集区整理 (MA5 {:.2}, MA20 {:.2})，等待方向选择", m5, m20), "均线蓄势", "neutral")
                }
            }
            (Some(m5), Some(_m10), None) => {
                if c >= m5 {
                    ("above_ma20", format!("站稳短线均线 MA5 ({:.2})", m5), "顺势跟踪", "bull")
                } else {
                    ("below_ma20", format!("跌破短线均线 MA5 ({:.2})", m5), "防守控仓", "bear")
                }
            }
            _ => ("neutral", "历史数据积累中，均线平稳观察".to_string(), "平稳观察", "neutral"),
        }
    } else {
        ("neutral", "暂无历史 K 线数据".to_string(), "等待数据", "neutral")
    };

    KLineData {
        code: code.to_string(),
        bars,
        ma_signal: ma_signal.to_string(),
        ma_comment: ma_comment.to_string(),
        kdj_status,
        support,
        resistance,
        kline_action: Some(kline_action.to_string()),
        kline_tone: Some(kline_tone.to_string()),
    }
}
