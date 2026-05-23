use std::{
    pin::Pin,
    task::{Context, Poll},
};

use axum::body::Bytes;
use tokio::process::Child;
use tokio_util::{io::ReaderStream, sync::CancellationToken};

pub struct StreamGuard {
    child: Child,
    reader: ReaderStream<tokio::process::ChildStdout>,
    cancel_token: CancellationToken,
    finished: bool,
}

impl StreamGuard {
    pub fn new(
        child: Child,
        stdout: tokio::process::ChildStdout,
        cancel_token: CancellationToken,
    ) -> Self {
        // 64KB buffer — default 4KB is way too small for video streaming
        // and causes excessive syscall overhead.
        Self {
            child,
            reader: ReaderStream::with_capacity(stdout, 65_536),
            cancel_token,
            finished: false,
        }
    }
}

impl futures_core::Stream for StreamGuard {
    type Item = Result<Bytes, std::io::Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let next = Pin::new(&mut self.reader).poll_next(cx);
        if matches!(next, Poll::Ready(None)) {
            self.finished = true;
        }
        next
    }
}

impl Drop for StreamGuard {
    fn drop(&mut self) {
        if !self.finished {
            self.cancel_token.cancel();
            let _ = self.child.start_kill();
        }
    }
}
