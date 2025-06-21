## Docker compose projects

This directory contains two Docker compose projects:

- [Reader node] 💻
- [Validator node] 🛡️

Both types of nodes run the Honeypot application locally,
feeding it with inputs sent through the base layer.
However, they differ in some aspects:

| Aspect | [Reader node] 💻 | [Validator node] 🛡️ |
| :-: | :-: | :-: |
| Source code | [`cartesi/rollups-node`] | [`cartesi/dave`] |
| Programming language | Go | Rust |
| Provides output proofs? | Yes [^proofs] | No |
| Accepts inspect requests? | Yes [^inspects] | No |
| Participates in disputes? | No | Yes [^disputes] |

[Reader node]: ./reader
[Validator node]: ./validator

[`cartesi/rollups-node`]: https://github.com/cartesi/rollups-node
[`cartesi/dave`]: https://github.com/cartesi/dave

[^proofs]: The reader node provides proofs for validating and executing
outputs (which, in the case of Honeypot, are only withdrawal vouchers)
through the Cartesi Rollups Node JSON-RPC API.

[^inspects]: The reader node allows inspect requests
(which, in the case of Honeypot, consults the token balance of the application)
to be sent to the machine through the Cartesi Rollups Node HTTP API.

[^disputes]: The validator node participates in any disputes that may arise
regarding the application state, defending the honest claim.
