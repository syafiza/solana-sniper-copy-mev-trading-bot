# Stage 1: Build
FROM rust:1.75-slim-bookworm as builder
WORKDIR /usr/src/app

# Install build dependencies (OpenSSL, etc.)
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
# Create dummy main to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm src/main.rs

# Copy source code
COPY . .
# Build actual application
RUN touch src/main.rs && cargo build --release

# Stage 2: Runtime
FROM debian:bookworm-slim
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy binary from builder
COPY --from=builder /usr/src/app/target/release/solana-sniper-bot ./solana-bot
COPY schema.sql .

# Expose gRPC port if needed
EXPOSE 50051

CMD ["./solana-bot"]
