use serde::Deserialize;
use std::time::Duration;
use thiserror::Error;

use super::constants::{EXPECTED_PRODUCT_ID, HTTP_TIMEOUT_SECS, LS_API_BASE};

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("network error: {0}")]
    Network(String),
    #[error("lemon squeezy rejected the request: {0}")]
    Rejected(String),
    #[error("license is for a different product")]
    WrongProduct,
    #[error("unexpected response shape: {0}")]
    BadShape(String),
}

impl From<reqwest::Error> for ApiError {
    fn from(e: reqwest::Error) -> Self { ApiError::Network(e.to_string()) }
}

#[derive(Debug, Deserialize)]
pub struct LicenseKeyInfo {
    pub status:     String,
    pub expires_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Instance {
    pub id: String,
}

#[derive(Debug, Deserialize)]
pub struct Meta {
    pub product_id:     u64,
    pub customer_email: String,
}

#[derive(Debug, Deserialize)]
pub struct ActivateResponse {
    pub activated:   bool,
    pub error:       Option<String>,
    pub license_key: LicenseKeyInfo,
    #[serde(default)]
    pub instance:    Option<Instance>,
    pub meta:        Meta,
}

#[derive(Debug, Deserialize)]
pub struct ValidateResponse {
    pub valid:       bool,
    pub error:       Option<String>,
    pub license_key: LicenseKeyInfo,
    pub meta:        Meta,
}

#[derive(Debug, Deserialize)]
pub struct DeactivateResponse {
    pub deactivated: bool,
    pub error:       Option<String>,
}

pub struct Client {
    http:     reqwest::Client,
    base_url: String,
}

impl Default for Client {
    fn default() -> Self { Self::new() }
}

impl Client {
    pub fn new() -> Self { Self::with_base(LS_API_BASE.into()) }

    pub fn with_base(base_url: String) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
            .build()
            .expect("reqwest client builds");
        Self { http, base_url }
    }

    pub async fn activate(&self, key: &str, instance_name: &str) -> Result<ActivateResponse, ApiError> {
        let resp = self.http
            .post(format!("{}/licenses/activate", self.base_url))
            .header("Accept", "application/json")
            .form(&[("license_key", key), ("instance_name", instance_name)])
            .send().await?
            .error_for_status()?;
        let parsed: ActivateResponse = resp.json().await
            .map_err(|e| ApiError::BadShape(e.to_string()))?;
        if !parsed.activated {
            return Err(ApiError::Rejected(parsed.error.unwrap_or_else(|| "unknown".into())));
        }
        if EXPECTED_PRODUCT_ID != 0 && parsed.meta.product_id != EXPECTED_PRODUCT_ID {
            return Err(ApiError::WrongProduct);
        }
        Ok(parsed)
    }

    pub async fn validate(&self, key: &str, instance_id: &str) -> Result<ValidateResponse, ApiError> {
        let resp = self.http
            .post(format!("{}/licenses/validate", self.base_url))
            .header("Accept", "application/json")
            .form(&[("license_key", key), ("instance_id", instance_id)])
            .send().await?
            .error_for_status()?;
        resp.json().await.map_err(|e| ApiError::BadShape(e.to_string()))
    }

    pub async fn deactivate(&self, key: &str, instance_id: &str) -> Result<DeactivateResponse, ApiError> {
        let resp = self.http
            .post(format!("{}/licenses/deactivate", self.base_url))
            .header("Accept", "application/json")
            .form(&[("license_key", key), ("instance_id", instance_id)])
            .send().await?
            .error_for_status()?;
        resp.json().await.map_err(|e| ApiError::BadShape(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const KEY: &str = "38b1460a-5104-4067-a91d-77b872934d51";
    const INSTANCE: &str = "47596ad9-a811-4ebf-ac8a-03fc7b6d2a17";

    fn activate_ok_body(product_id: u64) -> serde_json::Value {
        serde_json::json!({
            "activated": true,
            "error": null,
            "license_key": { "status": "active", "expires_at": null },
            "instance": { "id": INSTANCE },
            "meta": { "product_id": product_id, "customer_email": "jane@example.com" }
        })
    }

    #[tokio::test]
    async fn activate_success_returns_instance_id() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/licenses/activate"))
            .respond_with(ResponseTemplate::new(200)
                .set_body_json(activate_ok_body(987515)))
            .mount(&server).await;

        let client = Client::with_base(server.uri());
        let resp = client.activate(KEY, "test-host").await.unwrap();
        assert!(resp.activated);
        assert_eq!(resp.instance.as_ref().unwrap().id, INSTANCE);
    }

    #[tokio::test]
    async fn activate_rejected_returns_rejected_error() {
        let server = MockServer::start().await;
        let body = serde_json::json!({
            "activated": false,
            "error": "license_key activation limit reached",
            "license_key": { "status": "active", "expires_at": null },
            "meta": { "product_id": 0, "customer_email": "x" }
        });
        Mock::given(method("POST"))
            .and(path("/licenses/activate"))
            .respond_with(ResponseTemplate::new(200).set_body_json(body))
            .mount(&server).await;

        let client = Client::with_base(server.uri());
        let err = client.activate(KEY, "host").await.unwrap_err();
        assert!(matches!(err, ApiError::Rejected(msg) if msg.contains("limit")));
    }

    #[tokio::test]
    async fn activate_wrong_product_id_returns_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/licenses/activate"))
            .respond_with(ResponseTemplate::new(200).set_body_json(activate_ok_body(999)))
            .mount(&server).await;
        let client = Client::with_base(server.uri());
        let err = client.activate(KEY, "host").await.unwrap_err();
        assert!(matches!(err, ApiError::WrongProduct));
    }

    #[tokio::test]
    async fn validate_returns_parsed_response() {
        let server = MockServer::start().await;
        let body = serde_json::json!({
            "valid": true,
            "error": null,
            "license_key": { "status": "active", "expires_at": null },
            "meta": { "product_id": 0, "customer_email": "jane@example.com" }
        });
        Mock::given(method("POST"))
            .and(path("/licenses/validate"))
            .respond_with(ResponseTemplate::new(200).set_body_json(body))
            .mount(&server).await;
        let client = Client::with_base(server.uri());
        let resp = client.validate(KEY, INSTANCE).await.unwrap();
        assert!(resp.valid);
        assert_eq!(resp.license_key.status, "active");
    }

    #[tokio::test]
    async fn deactivate_returns_success() {
        let server = MockServer::start().await;
        let body = serde_json::json!({
            "deactivated": true,
            "error": null
        });
        Mock::given(method("POST"))
            .and(path("/licenses/deactivate"))
            .respond_with(ResponseTemplate::new(200).set_body_json(body))
            .mount(&server).await;
        let client = Client::with_base(server.uri());
        let resp = client.deactivate(KEY, INSTANCE).await.unwrap();
        assert!(resp.deactivated);
    }

    #[tokio::test]
    async fn network_error_maps_to_apierror_network() {
        let client = Client::with_base("http://127.0.0.1:1".into()); // closed port
        let err = client.activate(KEY, "host").await.unwrap_err();
        assert!(matches!(err, ApiError::Network(_)));
    }
}
