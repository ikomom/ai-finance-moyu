use super::types::*;

/// Calculate rolling MA5, MA10, MA20, and MACD(12, 26, 9), and synthesize diagnostics.
pub fn compute_kline_indicators(code: &str, mut bars: Vec<KLineBar>) -> KLineData {
    let n = bars.len();
    for i in 0..n {
        if i + 1 >= 5 {
            let sum: f64 = bars[i + 1 - 5..=i].iter().map(|b| b.close).sum();
            bars[i].ma5 = Some((sum / 5.0 * 100.0).round() / 100.0);
        }
        if i + 1 >= 10 {
            let sum: f64 = bars[i + 1 - 10..=i].iter().map(|b| b.close).sum();
            bars[i].ma10 = Some((sum / 10.0 * 100.0).round() / 100.0);
        }
        if i + 1 >= 20 {
            let sum: f64 = bars[i + 1 - 20..=i].iter().map(|b| b.close).sum();
            bars[i].ma20 = Some((sum / 20.0 * 100.0).round() / 100.0);
        }
    }

    // MACD(12, 26, 9) standard exponential moving average recursion
    if n > 0 {
        let mut ema12 = bars[0].close;
        let mut ema26 = bars[0].close;
        let mut dea = 0.0;

        for i in 0..n {
            let c = bars[i].close;
            if i == 0 {
                ema12 = c;
                ema26 = c;
                dea = 0.0;
                bars[i].dif = Some(0.0);
                bars[i].dea = Some(0.0);
                bars[i].macd = Some(0.0);
            } else {
                ema12 = ema12 * (11.0 / 13.0) + c * (2.0 / 13.0);
                ema26 = ema26 * (25.0 / 27.0) + c * (2.0 / 27.0);
                let dif = ema12 - ema26;
                dea = dea * (8.0 / 10.0) + dif * (2.0 / 10.0);
                let macd_hist = (dif - dea) * 2.0;

                bars[i].dif = Some((dif * 1000.0).round() / 1000.0);
                bars[i].dea = Some((dea * 1000.0).round() / 1000.0);
                bars[i].macd = Some((macd_hist * 1000.0).round() / 1000.0);
            }
        }
    }

    let (ma_signal, ma_comment) = if let Some(last) = bars.last() {
        match (last.ma5, last.ma10, last.ma20) {
            (Some(m5), Some(m10), Some(m20)) => {
                let c = last.close;
                if m5 > m10 && m10 > m20 && c >= m5 {
                    (
                        "bull_aligned".to_string(),
                        format!("日线呈多头排列 (MA5 {:.2} > MA10 {:.2} > MA20 {:.2})，均线支撑强劲，多方趋势向好", m5, m10, m20),
                    )
                } else if c >= m20 && m5 >= m20 {
                    (
                        "above_ma20".to_string(),
                        format!("价格稳于生命线 MA20 ({:.2}) 上方，短线均线承托有效", m20),
                    )
                } else if m5 < m10 && m10 < m20 && c <= m5 {
                    (
                        "bear_aligned".to_string(),
                        format!("日线呈空头排列 (MA5 {:.2} < MA10 {:.2} < MA20 {:.2})，空头承压，谨慎追高", m5, m10, m20),
                    )
                } else if c < m20 {
                    (
                        "below_ma20".to_string(),
                        format!("价格受制于生命线 MA20 ({:.2})，短线承压偏弱蓄势", m20),
                    )
                } else {
                    (
                        "neutral".to_string(),
                        format!("价格在均线密集区震荡整理 (MA5 {:.2}, MA20 {:.2})", m5, m20),
                    )
                }
            }
            (Some(m5), Some(m10), None) => {
                if m5 >= m10 {
                    ("above_ma20".to_string(), format!("MA5 ({:.2}) 金叉上穿 MA10 ({:.2})", m5, m10))
                } else {
                    ("below_ma20".to_string(), format!("MA5 ({:.2}) 承压于 MA10 ({:.2})", m5, m10))
                }
            }
            _ => ("neutral".to_string(), "历史数据积累中，均线平稳观察".to_string()),
        }
    } else {
        ("neutral".to_string(), "暂无历史 K 线数据".to_string())
    };

    KLineData {
        code: code.to_string(),
        bars,
        ma_signal,
        ma_comment,
    }
}
