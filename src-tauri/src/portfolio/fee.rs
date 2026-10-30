//! Commission, stamp duty, and fee computation for various asset classes.

use super::types::{AssetClass, BrokerFeeConfig, TradeAction};

/// Compute commission, fees, and stamp duty for a transaction.
pub fn calculate_fee(
    asset_class: AssetClass,
    action: TradeAction,
    price: f64,
    shares: u32,
    fee_config: &BrokerFeeConfig,
) -> f64 {
    let amount = price * (shares as f64);
    let (rate, min_fee, has_stamp_duty) = match asset_class {
        AssetClass::Stock => (fee_config.stock_rate, fee_config.stock_min_fee, true),
        AssetClass::Etf => (fee_config.etf_rate, fee_config.etf_min_fee, false),
        AssetClass::ConvertibleBond => (fee_config.bond_rate, fee_config.bond_min_fee, false),
    };

    let raw_commission = amount * rate;
    let commission = if min_fee > 0.0 {
        raw_commission.max(min_fee)
    } else {
        raw_commission
    };

    let stamp_duty = if has_stamp_duty && action == TradeAction::Sell {
        amount * fee_config.stamp_duty_rate
    } else {
        0.0
    };

    ((commission + stamp_duty) * 100.0).round() / 100.0
}
