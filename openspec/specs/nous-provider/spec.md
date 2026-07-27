# Nous Research Provider

## Purpose

Define the requirements for connecting Nous Research accounts, maintaining OAuth credentials, loading the runtime model catalog, and routing OpenAI-compatible embedding requests without a hardcoded embedding-model catalog.

## Requirements

### Requirement: Nous OAuth device authorization
The system SHALL allow a user to connect a Nous Research account through the provider's device authorization flow and SHALL persist the resulting provider credentials using the existing connection repository.

#### Scenario: Start device authorization
- **WHEN** an authenticated dashboard user starts a Nous Research connection
- **THEN** the system requests a device code from the configured Nous OAuth endpoint
- **AND** presents the returned verification URL and user code without requiring the user to paste credentials into 9Router

#### Scenario: Complete device authorization
- **WHEN** Nous returns a successful token response for an authorized device code
- **THEN** the system stores the access and refresh credentials for the Nous connection
- **AND** uses account metadata returned by Nous to identify the connection when available

### Requirement: Nous credential refresh
The system SHALL refresh expired or near-expiry Nous OAuth credentials through the Nous refresh-token protocol and SHALL preserve rotated refresh credentials returned by the provider.

#### Scenario: Refresh before a catalog request
- **WHEN** an active Nous connection has expired or is within the configured refresh window
- **AND** the dashboard requests the Nous model catalog
- **THEN** the system refreshes the Nous credential before calling the catalog endpoint
- **AND** persists the refreshed access token, expiry, and rotated refresh token through the connection repository

#### Scenario: Isolate provider credentials
- **WHEN** the system selects credentials for a Nous catalog request
- **THEN** it considers only active Nous connections
- **AND** does not send credentials belonging to another provider

### Requirement: Dynamic Nous model catalog
The system SHALL obtain selectable Nous models from the configured Nous model-catalog endpoint at runtime and SHALL NOT maintain a static embedding-model catalog in the Nous provider registry.

#### Scenario: Load the catalog for an authenticated user
- **WHEN** the dashboard renders a Nous provider model list and the provider declares a `modelsFetcher`
- **THEN** the dashboard requests the configured model catalog through the authenticated 9Router API
- **AND** renders matching models returned by that request
- **AND** deduplicates dynamic models against any built-in provider models

#### Scenario: Reject an unconfigured catalog target
- **WHEN** a model-catalog request supplies a URL and filter type that do not exactly match a registered provider `modelsFetcher`
- **THEN** the API rejects the request with HTTP 400
- **AND** does not fetch the supplied URL

#### Scenario: Classify models from upstream metadata
- **WHEN** the Nous catalog describes a model with embedding output metadata
- **THEN** the system classifies the model as `embedding`
- **AND** does not infer model kind from model-name keyword matching

#### Scenario: Filter selectable LLM models
- **WHEN** a Nous catalog model is classified as an LLM
- **THEN** it is selectable only when its reported context length is at least 200000 tokens
- **AND** embedding and image models are not excluded by the LLM context-length threshold

#### Scenario: Populate the Embedding Example selector
- **WHEN** the dynamic Nous embedding catalog finishes loading on the media-provider detail page
- **THEN** the system provides the merged embedding-model list to the Example component
- **AND** the Example model selector contains the catalog-derived models without requiring static registry entries

### Requirement: Nous embeddings routing
The system SHALL route Nous embedding requests through the OpenAI-compatible embedding adapter using the configured Nous embedding endpoint and an active Nous credential.

#### Scenario: Generate an embedding
- **WHEN** a client sends a valid `/v1/embeddings` request using a `nous/<model-id>` model
- **THEN** 9Router forwards the request to the configured Nous embeddings endpoint
- **AND** returns the upstream OpenAI-compatible embedding response

### Requirement: Observable catalog failures
The system SHALL expose model-catalog loading failures rather than silently representing failures as an empty successful catalog.

#### Scenario: Upstream catalog failure
- **WHEN** the configured upstream model catalog returns a non-success status
- **THEN** the API returns a non-success status to the dashboard
- **AND** the models UI presents a catalog-loading error
