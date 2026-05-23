use serde::Serialize;
use std::fmt;

#[derive(Debug, Serialize)]
pub struct RuyaError {
    pub message: String,
    pub code: String,
}

impl fmt::Display for RuyaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}]: {}", self.code, self.message)
    }
}

impl std::error::Error for RuyaError {}

impl From<std::io::Error> for RuyaError {
    fn from(err: std::io::Error) -> Self {
        RuyaError {
            message: err.to_string(),
            code: "IO_ERROR".to_string(),
        }
    }
}

pub type Result<T> = std::result::Result<T, RuyaError>;
