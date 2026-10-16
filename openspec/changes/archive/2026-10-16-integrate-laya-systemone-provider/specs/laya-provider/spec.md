## ADDED Requirements

### Requirement: Laya Provider Registration in 9Router
The system SHALL register `laya` as a native System One decision provider in 9Router with `serviceKinds: ["systemone"]`, `authType: "none"`, and configurable base URL via `LAYA_SYSTEMONE_URL` defaulting to `http://192.168.100.130:8000/v1/systemone`.

#### Scenario: Provider discovery and metadata
- **WHEN** a client or dashboard queries registered System One providers via `getProvidersByKind("systemone")`
- **THEN** `laya` appears in the provider list with valid display metadata, models list, and endpoint path.

### Requirement: Laya Model Resolution
The system SHALL expose model identifiers `laya/laya-auto`, `laya/english`, `laya/multilingual`, and `laya/typed-decisions` under provider `laya`, mapping upstream requests to the corresponding Laya decision models.

#### Scenario: Route decision request with laya-auto
- **WHEN** an authenticated client sends a `POST /v1/systemone` request with model `laya/laya-auto` and a valid state/questions payload
- **THEN** 9Router dispatches the native decision payload to Laya's endpoint without requiring authentication headers.

### Requirement: Automated Fallback to Cloud Jev
The system SHALL detect connection errors (connection refused, network unreachable, request timeout) when dispatching to the local Laya endpoint and SHALL automatically retry the decision request against the cloud `opencode-zen` lane (`opencode/jev-1.13-free`).

#### Scenario: Transparent failover when local host is offline
- **WHEN** a client requests `POST /v1/systemone` targeting `laya/*` while `AGENT-4070` is offline or `laya-serve` is down
- **THEN** 9Router intercepts the network connection error, logs an operational fallback audit message, and dispatches the payload to `opencode-zen`
- **AND** returns the resulting decision payload with HTTP 200 without exposing 502/504 errors to the caller.

### Requirement: Unauthenticated Local LAN Dispatch
The system SHALL NOT require an API key or bearer token when forwarding requests to the local Laya provider, preventing authentication mismatch failures across private subnets.

#### Scenario: Dispatch without authorization headers
- **WHEN** 9Router forwards a request to the configured `laya` provider
- **THEN** it does not inject authorization credentials if none are configured in the connection repository.
