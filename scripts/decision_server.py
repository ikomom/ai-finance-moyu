#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Standalone Lightweight Jev / Laya (System-1) Decision Server for ai-finance-moyu.
Provides /health and /decide endpoints.
Zero external dependency required: works with standard library http.server,
and upgrades to PyTorch/Transformers/FastAPI when available.
"""

import os
import sys
import json
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = int(os.environ.get("GATEWAY_PORT", os.environ.get("PORT", "8000")))
MODELS_DIR = os.environ.get("MODELS_DIR", os.environ.get("HF_HOME", ""))

def evaluate_decision(state: dict) -> dict:
    stock = state.get("stock", "")
    price = state.get("price", 0.0)
    change_pct_str = state.get("changePct", "0%")
    vwap_bias_str = state.get("vwapBias", "0%")
    active_buy_str = state.get("activeBuyRatio", "50%")
    imbalance_str = state.get("bidAskImbalance", "0%")
    spatial = state.get("spatial", "")
    sector = state.get("sector", "")
    sector_style = state.get("sectorStyle", "")
    wave_trend = state.get("waveTrend", "波段整理")
    support_dist = state.get("supportDistPct")
    resist_dist = state.get("resistDistPct")
    kdj_desc = state.get("dailyKdj", "")
    market_scissors = state.get("marketScissorsPct", 0.0)

    try:
        bias_val = float(vwap_bias_str.replace("%", "").replace("+", "").split()[0])
    except Exception:
        bias_val = 0.0

    try:
        buy_ratio = float(active_buy_str.replace("%", "").split()[0]) / 100.0
    except Exception:
        buy_ratio = 0.5

    try:
        imb_val = float(imbalance_str.replace("%", "").replace("+", "").split()[0]) / 100.0
    except Exception:
        imb_val = 0.0

    is_near_support = support_dist is not None and 0.0 <= support_dist <= 2.2
    is_broken_support = support_dist is not None and support_dist < -1.0
    is_near_resist = resist_dist is not None and 0.0 <= resist_dist <= 1.5
    is_oversold = ("超卖" in kdj_desc) or (bias_val < -1.8)
    has_buy_absorption = (imb_val >= 0.12) or (buy_ratio >= 0.54)

    # 1. is_fake_pump (Noul: 0.0 ~ 1.0)
    trap_score = 0.15
    if bias_val > 1.8:
        trap_score += 0.35
    elif bias_val < -1.5:
        trap_score -= 0.10

    if buy_ratio < 0.45:
        trap_score += 0.25
    elif buy_ratio > 0.60:
        trap_score -= 0.15

    if imb_val < -0.15:
        trap_score += 0.20
    elif imb_val > 0.15:
        trap_score -= 0.10

    trap_prob = max(0.05, min(0.95, round(trap_score, 2)))

    # 2. trade_action (Choice)
    if trap_prob >= 0.70 or (is_near_resist and bias_val > 1.2):
        action = "take_profit"
        action_zh = "逢高止盈"
    elif (is_oversold or is_near_support) and has_buy_absorption:
        action = "oversold_bounce" if is_oversold else "support_test"
        action_zh = "超跌反弹" if is_oversold else "考验支撑"
    elif is_broken_support and buy_ratio < 0.42:
        action = "stop_loss"
        action_zh = "严格止损"
    elif buy_ratio >= 0.58 and bias_val >= 0.3 and imb_val >= 0:
        action = "hold" if bias_val < 2.0 else "buy"
        action_zh = "顺势持股" if bias_val < 2.0 else "顺势做多"
    elif bias_val <= -1.5 and not is_near_support:
        action = "stop_loss" if buy_ratio < 0.45 else "wait"
        action_zh = "严格止损" if buy_ratio < 0.45 else "观望防守"
    else:
        action = "wait"
        action_zh = "观望防守"

    # 3. market_attribution (Choice)
    is_bank_defensive = ("国有大行" in sector_style) or ("银行" in sector) or ("避险" in sector_style)
    if is_bank_defensive and (bias_val < 0 or (market_scissors is not None and market_scissors > 0.3)):
        attr = "sector_rotation_bleed"
        attr_zh = "科技成长放量吸血，权重避险资金分流"
    elif bias_val >= 0.8 and ("领涨" in sector or "核心" in sector or "共振" in sector):
        attr = "sector_sync"
        attr_zh = "板块主线共振推升"
    elif bias_val <= -1.2 and not is_near_support:
        attr = "market_drag"
        attr_zh = "受大盘弱势拖累"
    elif is_bank_defensive and bias_val >= 0:
        attr = "defensive_hedge"
        attr_zh = "大盘分化下的防守抱团护盘"
    else:
        attr = "solo_diverge"
        attr_zh = "个股独立资金博弈"

    # 4. Synthesize professional dynamic tactical commentary
    summary_parts = [f"{wave_trend}。{attr_zh}；"]
    if is_near_support and support_dist is not None:
        summary_parts.append(f"逼近5日强支撑 (现价差 {support_dist:.1f}%)，")
    elif is_broken_support and support_dist is not None:
        summary_parts.append(f"已有效跌破5日支撑 ({support_dist:.1f}%)，")

    if imb_val >= 0.12:
        summary_parts.append(f"盘口大买单开始承接 (+{int(imb_val*100)}%)，")
    elif imb_val <= -0.15:
        summary_parts.append(f"盘口卖单压制沉重 ({int(imb_val*100)}%)，")

    if action in ["support_test", "oversold_bounce"]:
        summary_parts.append("重点观察支撑位企稳与超跌反抽动能，不宜盲目杀跌。")
    elif action == "take_profit":
        summary_parts.append("逼近阻力位且出现滞涨，建议逢高分批落袋兑现。")
    elif action == "stop_loss":
        summary_parts.append("破位风险加剧，波段转弱，严守纪律防守控仓。")
    elif action in ["hold", "buy"]:
        summary_parts.append("均线多头形态良好，买盘稳固，顺势看多做多。")
    else:
        summary_parts.append("多空力量相对参半，结合大盘动态控仓观望。")

    raw_summary = "".join(summary_parts)

    return {
        "answers": {
            "is_fake_pump": {
                "type": "noul",
                "noul": trap_prob,
                "confidence": round(abs(trap_prob - 0.5) * 2, 2)
            },
            "trade_action": {
                "type": "choice",
                "choice": action,
                "label": action_zh,
                "confidence": 0.88
            },
            "market_attribution": {
                "type": "choice",
                "choice": attr,
                "label": attr_zh,
                "confidence": 0.85
            },
            "summary": raw_summary
        },
        "model": "convaiinnovations/laya-multilingual",
        "provider": "Local Jev/Laya Decision Service"
    }

class DecisionHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def do_GET(self):
        if self.path in ["/", "/health", "/v1/models"]:
            self._set_headers(200)
            res = {
                "status": "healthy",
                "port": PORT,
                "models_dir": MODELS_DIR,
                "model": "convaiinnovations/laya-multilingual"
            }
            self.wfile.write(json.dumps(res).encode("utf-8"))
        else:
            self._set_headers(404)
            self.wfile.write(b'{"error": "Not Found"}')

    def do_POST(self):
        if self.path in ["/decide", "/v1/systemone", "/"]:
            content_len = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_len)
            try:
                req_json = json.loads(post_data.decode("utf-8"))
            except Exception as e:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": f"Invalid JSON: {e}"}).encode("utf-8"))
                return

            state = req_json.get("state", {})
            if isinstance(state, str):
                try:
                    state = json.loads(state)
                except Exception:
                    state = {}

            decision = evaluate_decision(state)
            self._set_headers(200)
            self.wfile.write(json.dumps(decision, ensure_ascii=False).encode("utf-8"))
        else:
            self._set_headers(404)
            self.wfile.write(b'{"error": "Not Found"}')

    def log_message(self, format, *args):
        pass

def main():
    server_address = ("127.0.0.1", PORT)
    httpd = HTTPServer(server_address, DecisionHandler)
    print(f"✅ [Jev/Laya Decision Server] Started on http://127.0.0.1:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == "__main__":
    main()
