//! Compiled-in license constants.
//!
//! `EXPECTED_PRODUCT_ID` is the Lemon Squeezy `product_id` returned in the
//! `activate` response meta. Set it to the staging product ID during
//! development, and to the production product ID before the v1.3.0 tag.
//! The final value is wired in Task 14.

pub const LS_API_BASE: &str = "https://api.lemonsqueezy.com/v1";
pub const CHECKOUT_URL: &str =
    "https://remex.lemonsqueezy.com/buy/REPLACE_ME?checkout%5Bcustom%5D%5Bsource%5D=studio-in-app";
pub const EXPECTED_PRODUCT_ID: u64 = 0; // set in Task 14
pub const REVALIDATE_INTERVAL_SECS: u64 = 14 * 24 * 60 * 60; // 14 days
pub const HTTP_TIMEOUT_SECS: u64 = 10;
