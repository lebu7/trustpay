# TrustPay

Blockchain-based Business Payment Verification System with AI Fraud Risk Scoring, Microservices, and Cloud-ready deployment.

## Components
- Blockchain: Solidity smart contract records payment proofs on testnet
- Microservices:
  - auth-service (Node/Express + SQLite)
  - payment-service (Node/Express + SQLite)
  - verify-service (Node/Express)
  - ai-risk-service (Python/FastAPI)
- Frontend: React dashboard for customers and admins
